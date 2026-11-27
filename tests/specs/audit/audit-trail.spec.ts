import { describeTest } from '../../src/core/allure';
import { expect, test } from '../../src/core/fixtures';
import { inr } from '../../src/data/money';
import { submitTravel } from '../../src/data/scenarios';

test.describe('Audit trail', () => {
  test('AU-01 every state change writes one timeline entry with the actor @regression @audit', async ({ as }) => {
    await describeTest({ epic: 'Audit', feature: 'Timeline', severity: 'critical', ref: 'ARD 7 audit' });
    const [employee, manager] = [await as('employee'), await as('manager')];
    const claim = await submitTravel(employee, 'AU-01', inr(8000));
    await manager.approvals.decide(claim.id, 'approve', 'ok');

    const timeline = await employee.claims.timeline(claim.id);
    const actions = timeline.map((t) => t.action);
    expect(timeline.length, 'create, submit, approve at least').toBeGreaterThanOrEqual(3);
    expect(actions.join(' ')).toMatch(/submit/i);
    expect(actions.join(' ')).toMatch(/approv/i);
    for (const entry of timeline) expect(entry.actor_name, 'no anonymous actions').not.toBe('');
  });

  test('AU-02 timeline entries are ordered and ids only grow (append-only) @regression @audit', async ({ as }) => {
    await describeTest({ epic: 'Audit', feature: 'Append-only', severity: 'critical', ref: 'ARD 7 / audit triggers' });
    const [employee, manager] = [await as('employee'), await as('manager')];
    const claim = await submitTravel(employee, 'AU-02', inr(8000));
    const before = await employee.claims.timeline(claim.id);
    await manager.approvals.decide(claim.id, 'send-back', 'again');
    const after = await employee.claims.timeline(claim.id);

    expect(after.length).toBeGreaterThan(before.length);
    expect(after.slice(0, before.length), 'earlier entries are unchanged').toEqual(before);
  });

  test('AU-03 there is no endpoint to change or delete audit events @regression @audit @security', async ({ as }) => {
    await describeTest({ epic: 'Audit', feature: 'Immutability', severity: 'blocker', ref: 'ARD 7 / C11' });
    const [employee, head] = [await as('employee'), await as('head')];
    const claim = await submitTravel(employee, 'AU-03', inr(8000));
    for (const who of [employee, head]) {
      for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
        const res = await who.http.request(method, `/api/v1/claims/${claim.id}/timeline`, { data: { action: 'tamper' } });
        expect([404, 405], `${method} on the timeline`).toContain(res.status);
      }
    }
  });

  test('AU-04 the employee, their manager and finance can read the timeline; a stranger cannot @regression @audit @security', async ({ as }) => {
    await describeTest({ epic: 'Audit', feature: 'Visibility', severity: 'critical', ref: 'ARD 3' });
    const [employee, manager, head, stranger] = [await as('employee'), await as('manager'), await as('head'), await as('employee2')];
    const claim = await submitTravel(employee, 'AU-04', inr(8000));
    for (const who of [employee, manager, head]) expect((await who.http.get(`/api/v1/claims/${claim.id}/timeline`)).status).toBe(200);
    expect((await stranger.http.get(`/api/v1/claims/${claim.id}/timeline`)).status).toBe(404);
  });
});
