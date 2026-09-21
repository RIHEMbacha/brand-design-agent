-- Brand Design Agent schema
-- Run in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    password_hash text not null,
    name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_users_email on public.users(email);

create table if not exists public.projects (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    name text not null,
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_projects_user_id
    on public.projects(user_id);

create table if not exists public.documents (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    filename text not null,
    mime_type text not null,
    storage_path text not null,
    size_bytes bigint not null default 0,
    status text not null default 'processing',
    error_message text,
    created_at timestamptz not null default now()
);

create index if not exists idx_documents_project_id
    on public.documents(project_id);

create table if not exists public.design_tokens (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null unique references public.projects(id) on delete cascade,
    version integer not null default 1,
    tokens jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.generated_artifacts (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    artifact_type text not null,
    name text,
    prompt text not null,
    files jsonb not null default '[]'::jsonb,
    output jsonb not null default '{}'::jsonb,
    zip_storage_path text,
    created_at timestamptz not null default now()
);

alter table public.generated_artifacts
    add column if not exists output jsonb;

alter table public.generated_artifacts
    add column if not exists name text;

update public.generated_artifacts
set output = jsonb_build_object(
    'artifact_type', artifact_type,
    'title', coalesce(name, prompt, 'Generated artifact'),
    'files', coalesce(files, '[]'::jsonb),
    'applied_tokens', '[]'::jsonb,
    'notes', '[]'::jsonb,
    'warnings', jsonb_build_array('This artifact was created before structured output was stored.')
)
where output is null;

alter table public.generated_artifacts
    alter column output set default '{}'::jsonb;

alter table public.generated_artifacts
    alter column output set not null;

create index if not exists idx_generated_artifacts_project_id
    on public.generated_artifacts(project_id);

-- Backend uses the Supabase service-role key and therefore should never expose
-- that key to the browser.
--
-- For the Storage side, create these PRIVATE buckets in Supabase Dashboard:
--   1) brand-files
--   2) generated-artifacts
--
-- Add Storage policies that match your eventual authentication model.
-- Do not make these buckets public unless you explicitly need public assets.
