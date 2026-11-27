import * as allure from 'allure-js-commons';

export type Severity = 'blocker' | 'critical' | 'normal' | 'minor' | 'trivial';

export interface TestMeta {
  /** Top-level grouping in the Allure Behaviors tab, e.g. 'Claims'. */
  epic: string;
  feature: string;
  story?: string;
  severity?: Severity;
  /** Traceability: ARD section, user story or control id, e.g. 'ARD 5 / PE-03'. */
  ref?: string;
  owner?: string;
}

/** Call at the top of a test so the report is grouped, ranked and traceable. */
export async function describeTest(meta: TestMeta): Promise<void> {
  await allure.epic(meta.epic);
  await allure.feature(meta.feature);
  if (meta.story) await allure.story(meta.story);
  await allure.severity(meta.severity ?? 'normal');
  if (meta.owner) await allure.owner(meta.owner);
  if (meta.ref) await allure.label('traceability', meta.ref);
}
