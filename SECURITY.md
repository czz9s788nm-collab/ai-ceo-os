# Security policy

Please do not open public issues for vulnerabilities or include production data,
credentials, database files, or private business records in reports.

Until a dedicated security address is published, use GitHub's private
vulnerability reporting feature.

## Deployment notes

- Run behind HTTPS in production.
- Keep the `data/` directory private and backed up.
- Use a unique owner password of at least 12 characters.
- Do not commit `.env` files, SQLite databases, exports, or customer data.
- Review authentication and authorization before exposing the service publicly.

