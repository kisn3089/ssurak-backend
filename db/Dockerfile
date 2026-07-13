FROM mysql:8.0

COPY db/init/01-grant-permissions.sh /docker-entrypoint-initdb.d/
RUN chmod +x /docker-entrypoint-initdb.d/01-grant-permissions.sh
