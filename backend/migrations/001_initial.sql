CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  username varchar(24) NOT NULL UNIQUE,
  email text NOT NULL DEFAULT '',
  birthday date NOT NULL,
  born_at bigint NOT NULL,
  password_hash text NOT NULL,
  metric text NOT NULL DEFAULT 'percentage' CHECK (metric IN ('focus','rest','percentage')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_by_account ON sessions(account_id);
CREATE TABLE transitions (
  account_id uuid NOT NULL REFERENCES accounts ON DELETE CASCADE,
  id uuid NOT NULL,
  at bigint NOT NULL,
  mode text NOT NULL CHECK (mode IN ('focus','rest','unknown')),
  PRIMARY KEY (account_id, at),
  UNIQUE (account_id, id)
);
