import { randomBytes } from 'node:crypto';
import { EnvConfig, Persona } from '../../config/environments';
import { HttpClient, mustOk } from './http-client';
import { Session } from './session';

export interface TempUser extends Persona {
  id: string;
}

let counter = 0;

/** Creates a throwaway user through the finance head's admin API (unique email and code). */
export async function createUser(
  head: Session,
  o: { role?: 'EMPLOYEE' | 'MANAGER' | 'AUDITOR' | 'FINANCE_HEAD'; managerId?: string | null; label?: string; password?: string } = {},
): Promise<TempUser> {
  const me = await head.me();
  const tag = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}${++counter}`;
  const password = o.password ?? `Tmp!${randomBytes(9).toString('base64url')}`;
  const email = `qa.tmp.${tag}@${me.email.split('@')[1]}`;
  const name = `QA ${o.label ?? 'Temp'} ${tag}`;
  const created = mustOk(
    await head.http.post<{ id: string }>('/api/v1/admin/users', {
      email,
      full_name: name,
      employee_code: `QT${tag}`.toUpperCase().slice(0, 16),
      role: o.role ?? 'EMPLOYEE',
      department_id: me.department_id,
      manager_id: o.managerId === undefined ? me.id : o.managerId,
      password,
    }),
    'create temp user',
  );
  return { id: created.id, role: 'employee', email, password, name };
}

/** A fresh, separate login session (does not touch the shared per-persona sessions). */
export const loginAs = (env: EnvConfig, user: Persona): Promise<HttpClient> => HttpClient.login(env, user);

export const patchUser = (head: Session, id: string, body: Record<string, unknown>) => head.http.patch(`/api/v1/admin/users/${id}`, body);
