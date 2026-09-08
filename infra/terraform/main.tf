# Regressa cloud infrastructure (stub).
# Intended targets: managed Postgres w/ TimescaleDB (Timescale Cloud), managed Redis, container runtime
# for ingest-api + worker, and Vercel (or equivalent) for apps/web.
terraform {
  required_version = ">= 1.6"
}

variable "environment" {
  type    = string
  default = "production"
}

output "database_name" {
  value = "regressa_${var.environment}"
}
