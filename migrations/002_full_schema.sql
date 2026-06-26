-- ============================================================
-- CAREERS18.COM — Full Database Migration v2
-- Run after 001_init.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMS ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('candidate', 'employer', 'recruiter', 'admin', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending_verification');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE otp_type AS ENUM ('email_verification', 'phone_verification', 'password_reset');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_type AS ENUM ('full_time', 'part_time', 'contract', 'freelance', 'internship');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('draft', 'active', 'closed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE application_status AS ENUM (
    'applied', 'reviewing', 'shortlisted',
    'interview_scheduled', 'rejected', 'hired', 'withdrawn'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'success', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_gateway AS ENUM ('razorpay', 'paytm', 'ccavenue', 'freecash', 'payu');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── USERS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               VARCHAR(255) UNIQUE NOT NULL,
  phone               VARCHAR(20) UNIQUE,
  password_hash       TEXT NOT NULL DEFAULT '',
  role                user_role NOT NULL DEFAULT 'candidate',
  status              user_status NOT NULL DEFAULT 'active',
  email_verified      BOOLEAN NOT NULL DEFAULT false,
  phone_verified      BOOLEAN NOT NULL DEFAULT false,
  preferred_language  VARCHAR(10) DEFAULT 'en',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- ─── REFRESH TOKENS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(user_id);

-- ─── OTP VERIFICATIONS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       VARCHAR(255),
  phone       VARCHAR(20),
  otp_code    VARCHAR(6) NOT NULL,
  type        otp_type NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT false,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_email_type ON otp_verifications(email, type, used);

-- ─── OAUTH ACCOUNTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     VARCHAR(50) NOT NULL,   -- 'google' | 'linkedin'
  provider_id  VARCHAR(255) NOT NULL,
  avatar       TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_accounts(user_id);

-- ─── USER PROFILES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name              VARCHAR(100),
  last_name               VARCHAR(100),
  headline                VARCHAR(255),
  summary                 TEXT,
  avatar_url              TEXT,
  resume_url              TEXT,
  location                VARCHAR(255),
  date_of_birth           DATE,
  gender                  VARCHAR(20),
  phone                   VARCHAR(20),
  linkedin_url            TEXT,
  github_url              TEXT,
  portfolio_url           TEXT,
  current_salary          NUMERIC(12,2),
  expected_salary         NUMERIC(12,2),
  notice_period_days      INTEGER DEFAULT 30,
  is_actively_looking     BOOLEAN DEFAULT true,
  total_experience_years  NUMERIC(4,1) DEFAULT 0,
  profile_completion      INTEGER DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ─── CANDIDATE SKILLS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_skills (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id            INTEGER NOT NULL REFERENCES skills(id),
  proficiency_level   VARCHAR(20) DEFAULT 'intermediate',
  years_of_experience NUMERIC(4,1) DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_id)
);

-- ─── CANDIDATE EXPERIENCE ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_experience (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name  VARCHAR(255) NOT NULL,
  job_title     VARCHAR(255) NOT NULL,
  location      VARCHAR(255),
  start_date    DATE NOT NULL,
  end_date      DATE,
  is_current    BOOLEAN DEFAULT false,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CANDIDATE EDUCATION ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_education (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution     VARCHAR(255) NOT NULL,
  degree          VARCHAR(255),
  field_of_study  VARCHAR(255),
  start_year      INTEGER,
  end_year        INTEGER,
  is_current      BOOLEAN DEFAULT false,
  grade           VARCHAR(50),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MASTER DATA ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS industries (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL UNIQUE,
  description   TEXT,
  display_order INTEGER DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_categories (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL UNIQUE,
  description   TEXT,
  display_order INTEGER DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skills (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  category    VARCHAR(100),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, category)
);
CREATE INDEX IF NOT EXISTS idx_skills_name     ON skills(name);
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);

CREATE TABLE IF NOT EXISTS industry_category_mapping (
  industry_id  INTEGER REFERENCES industries(id) ON DELETE CASCADE,
  category_id  INTEGER REFERENCES job_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (industry_id, category_id)
);

-- ─── COMPANIES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES users(id),
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  website       TEXT,
  logo_url      TEXT,
  size          VARCHAR(50),
  founded_year  INTEGER,
  industry_id   INTEGER REFERENCES industries(id),
  location      VARCHAR(255),
  linkedin_url  TEXT,
  is_active     BOOLEAN DEFAULT true,
  is_verified   BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_companies_owner ON companies(owner_id);

-- ─── JOBS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  requirements      TEXT,
  location          VARCHAR(255),
  job_type          job_type DEFAULT 'full_time',
  is_remote         BOOLEAN DEFAULT false,
  experience_min    INTEGER DEFAULT 0,
  experience_max    INTEGER,
  salary_min        NUMERIC(12,2),
  salary_max        NUMERIC(12,2),
  salary_currency   VARCHAR(10) DEFAULT 'INR',
  industry_id       INTEGER REFERENCES industries(id),
  category_id       INTEGER REFERENCES job_categories(id),
  openings          INTEGER DEFAULT 1,
  status            job_status DEFAULT 'active',
  is_featured       BOOLEAN DEFAULT false,
  views             INTEGER DEFAULT 0,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_status     ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_company    ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_industry   ON jobs(industry_id);
CREATE INDEX IF NOT EXISTS idx_jobs_category   ON jobs(category_id);

-- ─── JOB SKILLS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_skills (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id    UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill_id  INTEGER NOT NULL REFERENCES skills(id),
  UNIQUE(job_id, skill_id)
);

-- ─── JOB APPLICATIONS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_applications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id         UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status         application_status DEFAULT 'applied',
  cover_letter   TEXT,
  employer_note  TEXT,
  applied_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(candidate_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_apps_candidate ON job_applications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_apps_job       ON job_applications(job_id);

-- ─── SAVED JOBS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_jobs (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id    UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  saved_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);

-- ─── PAYMENT ORDERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  order_id          VARCHAR(100) UNIQUE NOT NULL,
  gateway           payment_gateway NOT NULL,
  gateway_order_id  VARCHAR(255),
  gateway_txn_id    VARCHAR(255),
  gateway_status    VARCHAR(100),
  amount            NUMERIC(12,2) NOT NULL,
  currency          VARCHAR(10) DEFAULT 'INR',
  status            payment_status DEFAULT 'pending',
  plan_id           VARCHAR(50),
  credits           INTEGER,
  description       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user    ON payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_orderid ON payment_orders(order_id);

-- ─── USER SUBSCRIPTIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id             VARCHAR(50) NOT NULL,
  order_id            VARCHAR(100),
  status              VARCHAR(20) DEFAULT 'active',
  credits_allocated   INTEGER DEFAULT 0,
  job_limit           INTEGER DEFAULT 0,
  started_at          TIMESTAMPTZ DEFAULT NOW(),
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ─── CREDIT WALLETS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_wallets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance     INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ─── AUTO updated_at TRIGGER ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN FOR t IN SELECT unnest(ARRAY['users','user_profiles','companies','jobs','job_applications','payment_orders'])
LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s', t, t);
  EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
END LOOP; END $$;
