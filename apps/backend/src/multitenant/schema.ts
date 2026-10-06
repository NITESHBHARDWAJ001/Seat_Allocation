import { SCHEMA, query, tbl } from './db.js';

export const ROLES = ['super_admin', 'org_admin', 'exam_cell', 'attendance_marker', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
export const ORG_ROLES = ROLES.filter((r) => r !== 'super_admin') as Exclude<Role, 'super_admin'>[];

/** Idempotent: safe to run on every start. */
export async function migrate(): Promise<void> {
  const statements = [
    `create schema if not exists "${SCHEMA}"`,
    `create sequence if not exists "${SCHEMA}".change_seq`,
    `create table if not exists ${tbl('organizations')} (
       id uuid primary key default gen_random_uuid(),
       name text not null,
       code text not null unique,
       contact_name text,
       contact_email text,
       contact_phone text,
       address text,
       status text not null default 'active' check (status in ('active','suspended')),
       created_at timestamptz not null default now()
     )`,
    `create table if not exists ${tbl('users')} (
       id uuid primary key default gen_random_uuid(),
       org_id uuid references ${tbl('organizations')}(id) on delete cascade,
       login text not null unique,
       name text not null,
       role text not null check (role in ('super_admin','org_admin','exam_cell','attendance_marker','viewer')),
       active boolean not null default true,
       password_hash text not null,
       must_change_password boolean not null default true,
       last_login_at timestamptz,
       created_at timestamptz not null default now(),
       check ((role = 'super_admin') = (org_id is null))
     )`,
    `create index if not exists users_org_idx on ${tbl('users')}(org_id)`,
    `create table if not exists ${tbl('refresh_tokens')} (
       id uuid primary key default gen_random_uuid(),
       user_id uuid not null references ${tbl('users')}(id) on delete cascade,
       token_hash text not null unique,
       expires_at timestamptz not null,
       revoked boolean not null default false,
       created_at timestamptz not null default now()
     )`,
    `create table if not exists ${tbl('audit_log')} (
       id bigserial primary key,
       at timestamptz not null default now(),
       actor_id uuid,
       actor_login text,
       org_id uuid,
       action text not null,
       target text,
       details jsonb
     )`,
    `create index if not exists audit_org_idx on ${tbl('audit_log')}(org_id, at desc)`,
    // One row per synced record. seq is a global, ever-increasing change counter: clients pull "everything after seq N".
    `create table if not exists ${tbl('records')} (
       org_id uuid not null references ${tbl('organizations')}(id) on delete cascade,
       entity text not null,
       id text not null,
       data jsonb not null default '{}'::jsonb,
       deleted boolean not null default false,
       seq bigint not null default nextval('"${SCHEMA}".change_seq'),
       updated_at timestamptz not null default now(),
       updated_by uuid,
       primary key (org_id, entity, id)
     )`,
    `alter table ${tbl('records')} add column if not exists updated_by_device text`,
    `create index if not exists records_pull_idx on ${tbl('records')}(org_id, seq)`,
  ];
  for (const sql of statements) await query(sql);
}
