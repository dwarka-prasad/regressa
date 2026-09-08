-- Runs once on first container start. Creates the test DB alongside regressa_dev.
CREATE DATABASE regressa_test;
\connect regressa_dev
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
\connect regressa_test
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
