-- Careers18 profile, resume, company address, and review extensions.
-- Additive migration: safe to run on existing databases.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  headline VARCHAR(255),
  summary TEXT,
  avatar_url TEXT,
  resume_url TEXT,
  location VARCHAR(255),
  date_of_birth DATE,
  gender VARCHAR(20),
  phone VARCHAR(30),
  linkedin_url TEXT,
  github_url TEXT,
  portfolio_url TEXT,
  current_salary NUMERIC(12,2),
  expected_salary NUMERIC(12,2),
  notice_period_days INTEGER DEFAULT 30,
  is_actively_looking BOOLEAN DEFAULT true,
  total_experience_years NUMERIC(4,1) DEFAULT 0,
  profile_completion INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'candidate_profiles'
  ) THEN
    INSERT INTO user_profiles (user_id, first_name, last_name, headline, summary,
      resume_url, location, phone, expected_salary, notice_period_days,
      is_actively_looking, profile_completion, created_at, updated_at)
    SELECT user_id, first_name, last_name, headline, bio, resume_url, location,
      phone_number, preferred_salary_max, expected_notice_period, true,
      profile_completion_percentage, created_at, updated_at
    FROM candidate_profiles
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS hr_contact_number VARCHAR(30),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS landmark VARCHAR(255),
  ADD COLUMN IF NOT EXISTS city VARCHAR(120),
  ADD COLUMN IF NOT EXISTS state VARCHAR(120),
  ADD COLUMN IF NOT EXISTS country VARCHAR(120) DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS postal_code VARCHAR(30),
  ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_reviews INTEGER DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'headquarters_location'
  ) THEN
    UPDATE companies
    SET city = COALESCE(city, NULLIF(split_part(headquarters_location, ',', 1), '')),
        country = COALESCE(country, 'India')
    WHERE city IS NULL OR country IS NULL;
  END IF;
END $$;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city VARCHAR(120),
  ADD COLUMN IF NOT EXISTS state VARCHAR(120),
  ADD COLUMN IF NOT EXISTS country VARCHAR(120) DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS preferred_job_role VARCHAR(255),
  ADD COLUMN IF NOT EXISTS preferred_industry VARCHAR(255),
  ADD COLUMN IF NOT EXISTS preferred_location VARCHAR(255),
  ADD COLUMN IF NOT EXISTS preferred_job_type VARCHAR(80),
  ADD COLUMN IF NOT EXISTS preferred_work_mode VARCHAR(80),
  ADD COLUMN IF NOT EXISTS professional_summary TEXT,
  ADD COLUMN IF NOT EXISTS achievements TEXT,
  ADD COLUMN IF NOT EXISTS resume_template VARCHAR(40) DEFAULT 'modern';

ALTER TABLE candidate_experience
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS employment_type VARCHAR(80),
  ADD COLUMN IF NOT EXISTS location VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS responsibilities TEXT,
  ADD COLUMN IF NOT EXISTS skills_used TEXT;

UPDATE candidate_experience
SET user_id = COALESCE(user_id, candidate_id),
    is_current = COALESCE(is_current, is_currently_working)
WHERE user_id IS NULL OR is_current IS NULL;

ALTER TABLE candidate_education
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS institution VARCHAR(255),
  ADD COLUMN IF NOT EXISTS highest_qualification VARCHAR(255),
  ADD COLUMN IF NOT EXISTS university_college VARCHAR(255),
  ADD COLUMN IF NOT EXISTS start_year INTEGER,
  ADD COLUMN IF NOT EXISTS end_year INTEGER,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS grade VARCHAR(50),
  ADD COLUMN IF NOT EXISTS passing_year INTEGER,
  ADD COLUMN IF NOT EXISTS percentage_cgpa VARCHAR(50);

UPDATE candidate_education
SET user_id = COALESCE(user_id, candidate_id),
    institution = COALESCE(institution, institution_name),
    university_college = COALESCE(university_college, institution_name),
    highest_qualification = COALESCE(highest_qualification, degree),
    start_year = COALESCE(start_year, EXTRACT(YEAR FROM start_date)::integer),
    end_year = COALESCE(end_year, EXTRACT(YEAR FROM end_date)::integer),
    passing_year = COALESCE(passing_year, EXTRACT(YEAR FROM end_date)::integer),
    is_current = COALESCE(is_current, is_currently_studying),
    grade = COALESCE(grade, grade_percentage::text),
    percentage_cgpa = COALESCE(percentage_cgpa, grade_percentage::text)
WHERE user_id IS NULL OR institution IS NULL OR university_college IS NULL;

ALTER TABLE candidate_skills
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

UPDATE candidate_skills
SET user_id = COALESCE(user_id, candidate_id),
    created_at = COALESCE(created_at, added_at, NOW())
WHERE user_id IS NULL OR created_at IS NULL;

CREATE TABLE IF NOT EXISTS candidate_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  issuing_organization VARCHAR(255),
  issue_date DATE,
  expiry_date DATE,
  credential_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE candidate_certifications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
UPDATE candidate_certifications
SET user_id = COALESCE(user_id, candidate_id),
    name = COALESCE(name, certification_name),
    updated_at = COALESCE(updated_at, created_at, NOW())
WHERE user_id IS NULL OR name IS NULL OR updated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_candidate_certifications_user ON candidate_certifications(user_id);

CREATE TABLE IF NOT EXISTS candidate_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language VARCHAR(120) NOT NULL,
  proficiency_level VARCHAR(40) DEFAULT 'Professional',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, language)
);
CREATE INDEX IF NOT EXISTS idx_candidate_languages_user ON candidate_languages(user_id);

CREATE TABLE IF NOT EXISTS candidate_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_name VARCHAR(255) NOT NULL,
  description TEXT,
  technologies_used TEXT,
  project_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_candidate_projects_user ON candidate_projects(user_id);

CREATE TABLE IF NOT EXISTS company_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  overall_rating INTEGER NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  work_culture INTEGER CHECK (work_culture BETWEEN 1 AND 5),
  salary_benefits INTEGER CHECK (salary_benefits BETWEEN 1 AND 5),
  career_growth INTEGER CHECK (career_growth BETWEEN 1 AND 5),
  management INTEGER CHECK (management BETWEEN 1 AND 5),
  work_life_balance INTEGER CHECK (work_life_balance BETWEEN 1 AND 5),
  interview_experience INTEGER CHECK (interview_experience BETWEEN 1 AND 5),
  review_text TEXT NOT NULL,
  employer_response TEXT,
  employer_responded_at TIMESTAMPTZ,
  status VARCHAR(30) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_company_reviews_company_status ON company_reviews(company_id, status);
CREATE INDEX IF NOT EXISTS idx_company_reviews_rating ON company_reviews(overall_rating);

CREATE OR REPLACE VIEW company_rating_summary AS
SELECT
  c.id AS company_id,
  COALESCE(ROUND(AVG(r.overall_rating)::numeric, 2), 0) AS average_rating,
  COUNT(r.id)::integer AS total_reviews,
  COALESCE(AVG(
    COALESCE(r.work_culture, r.overall_rating) +
    COALESCE(r.salary_benefits, r.overall_rating) +
    COALESCE(r.career_growth, r.overall_rating) +
    COALESCE(r.management, r.overall_rating) +
    COALESCE(r.work_life_balance, r.overall_rating)
  ) / 5, 0) AS review_quality
FROM companies c
LEFT JOIN company_reviews r ON r.company_id = c.id AND r.status = 'approved'
GROUP BY c.id;
