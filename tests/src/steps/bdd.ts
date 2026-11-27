import { createBdd, defineParameterType } from 'playwright-bdd';
import { test } from '../core/fixtures';

/** Every step file imports Given/When/Then from here so they all share our fixtures (as, ui, world, log, ...). */
export { test };
export const { Given, When, Then } = createBdd(test);

/** A person as the feature files name them: "the manager", "the other employee", "the finance head", ... */
defineParameterType({
  name: 'person',
  regexp: /(?:other )?employee|(?:other )?manager|delegate|auditor|finance head|head|anonymous/,
  transformer: (name: string) => name,
});
