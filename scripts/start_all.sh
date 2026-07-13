#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

DOCKER_COMPOSE_BIN=""
DOCKER_COMPOSE_SUBCMD=""

STOP_SERVICES=false
FIRST_RUN=false

show_help() {
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  -h, --help     도움말 표시"
  echo "  -s, --stop     모든 서비스 중지"
  echo ""
  echo "Examples:"
  echo "  $0              # 서비스 시작"
  echo "  $0 --stop       # 서비스 중지"
  exit 0
}

while [ "$1" != "" ]; do
  case $1 in
    -h | --help )   show_help
                    ;;
    -s | --stop )   STOP_SERVICES=true
                    ;;
    * )             echo "Error: 알 수 없는 옵션: $1"
                    show_help
                    ;;
  esac
  shift
done

detect_compose_cmd() {
  if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_BIN="docker"
    DOCKER_COMPOSE_SUBCMD="compose"
    return 0
  fi
  if command -v docker-compose &> /dev/null && docker-compose version &> /dev/null; then
    DOCKER_COMPOSE_BIN="docker-compose"
    DOCKER_COMPOSE_SUBCMD=""
    return 0
  fi
  return 1
}

run_compose() {
  "$DOCKER_COMPOSE_BIN" $DOCKER_COMPOSE_SUBCMD -f "$PROJECT_ROOT/docker-compose.dev.yml" "$@"
}

check_docker() {
  command -v docker &> /dev/null || { echo "Error: docker not found"; exit 1; }
  detect_compose_cmd || { echo "Error: docker compose not found"; exit 1; }
  docker info &> /dev/null || { echo "Error: docker daemon not running"; exit 1; }
}

generate_secrets() {
  GEN_DB_ROOT_PW=$(openssl rand -hex 16)
  GEN_DB_PW=$(openssl rand -hex 16)
  GEN_JWT_ACCESS=$(openssl rand -hex 24)
  GEN_JWT_REFRESH=$(openssl rand -hex 24)
  GEN_REDIS_PW=$(openssl rand -hex 24)
}

replace_secrets() {
  local src="$1"
  local dest="$2"

  sed \
    -e "s|^DB_ROOT_PASSWORD=.*|DB_ROOT_PASSWORD=$GEN_DB_ROOT_PW|" \
    -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$GEN_DB_PW|" \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=mysql://ssurak:${GEN_DB_PW}@localhost:3306/ssurak?connection_limit=10\&pool_timeout=10|" \
    -e "s|^JWT_ACCESS_TOKEN_SECRET=.*|JWT_ACCESS_TOKEN_SECRET=$GEN_JWT_ACCESS|" \
    -e "s|^JWT_REFRESH_TOKEN_SECRET=.*|JWT_REFRESH_TOKEN_SECRET=$GEN_JWT_REFRESH|" \
    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$GEN_REDIS_PW|" \
    "$src" > "$dest"
}

check_env_file() {
  cd "$PROJECT_ROOT"
  if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
      echo "Generating .env from .env.example with auto-generated secrets..."
      generate_secrets
      replace_secrets ".env.example" ".env"
      FIRST_RUN=true
      echo "Created .env with auto-generated secrets (migrate + seed will run after startup)"
      echo "Installing dependencies..."
      pnpm install
      pnpm db:generate
    else
      echo "Error: .env file not found. Please create one based on the project documentation."
      exit 1
    fi
  fi
}

wait_for_ssurak() {
  echo "Waiting for ssurak to be ready..."
  local max_attempts=60
  local attempt=0

  while [ $attempt -lt $max_attempts ]; do
    if curl -fsS "http://localhost:${SERVER_PORT:-8080}/" >/dev/null 2>&1; then
      echo "ssurak is ready!"
      return 0
    fi

    # Check if container exited with error
    if ! run_compose ps ssurak | grep -q "Up"; then
      echo "Error: ssurak container is not running"
      run_compose logs ssurak --tail 50
      exit 1
    fi

    attempt=$((attempt + 1))
    sleep 2
  done

  echo "Warning: Timeout waiting for ssurak. Check logs with: docker compose logs ssurak"
  return 1
}

stop_services() {
  echo "=== Stopping ssurak Services ==="
  echo ""

  check_docker
  cd "$PROJECT_ROOT"

  run_compose down --remove-orphans
  echo ""
  echo "=== All services stopped ==="
}

main() {
  if [ "$STOP_SERVICES" = true ]; then
    stop_services
    exit 0
  fi

  echo "=== ssurak Development Environment Setup ==="
  echo ""

  check_docker
  check_env_file

  cd "$PROJECT_ROOT"

  # Load environment variables for port detection
  set -a
  . "$PROJECT_ROOT/.env"
  set +a

  echo ""
  echo "Starting Docker containers..."
  run_compose up --build -d

  echo ""
  run_compose ps

  echo ""
  wait_for_ssurak

  # 최초 실행(.env 생성) 시에만 마이그레이션 + 시드 적용 (둘 다 멱등)
  if [ "$FIRST_RUN" = true ]; then
    echo ""
    echo "Applying migrations and seed data (first run)..."
    pnpm --filter @ssurak/db prisma:deploy
    pnpm --filter @ssurak/db prisma:seed
  fi

  echo ""
  echo "=== All services started ==="
  echo ""
  echo "  ssurak (API):    http://localhost:${SERVER_PORT:-8080}"
  echo "  API Docs:        http://localhost:${SERVER_PORT:-8080}/docs"
  echo "  Prisma Studio:   http://localhost:5555"
  echo "  redis (Cache):   redis://localhost:6379"
  echo ""
  echo "To view logs:  docker compose logs -f [service]"
  echo "To stop all:   $0 --stop"
}

main
