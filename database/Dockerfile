FROM mariadb:11

# Migrations are mounted via docker-compose volume into /docker-entrypoint-initdb.d/
# MariaDB runs all *.sql files in that directory on first boot (alphabetical order).

EXPOSE 3306
