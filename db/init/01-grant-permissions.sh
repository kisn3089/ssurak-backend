#!/bin/bash
# Grant privileges for Prisma shadow database creation
# This script runs during MySQL initialization (only when volume is empty)

mysql -u root -p"$MYSQL_ROOT_PASSWORD" <<-EOSQL
    -- Minimal global privileges for Prisma shadow DB creation
    GRANT CREATE, DROP ON *.* TO '$MYSQL_USER'@'%';
    -- Full schema privileges scoped to the application database only
    GRANT ALTER, INDEX, REFERENCES ON \`${MYSQL_DATABASE}\`.* TO '$MYSQL_USER'@'%';
    FLUSH PRIVILEGES;
EOSQL
