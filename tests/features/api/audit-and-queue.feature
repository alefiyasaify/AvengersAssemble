@audit @regression
Feature: Audit trail and the auditor review queue

  @critical
  Scenario: Every state change is recorded with who did it
    Given the employee has submitted a travel claim of 8000 INR
    When the manager approves the claim
    Then the audit timeline has at least 3 entries naming who acted
    And the audit timeline mentions "submit"
    And the audit timeline mentions "approv"

  @critical
  Scenario: The audit trail is append-only
    Given the employee has submitted a travel claim of 8000 INR
    And the audit timeline of the claim is noted
    When the manager sends the claim back with the comment "again"
    Then the earlier audit entries are unchanged

  @blocker @security
  Scenario: Nobody can change or delete audit events through the API
    Given the employee has submitted a travel claim of 8000 INR
    When the finance head tries to delete the audit timeline of the claim
    Then the response status is 405

  @approvals @critical @e2e
  Scenario: Bulk approve skips a duplicate with a reason and approves the clean claim
    Given two claims of 30,000 INR wait at the auditor: one duplicate and one clean
    When the auditor bulk approves both claims
    Then the duplicate claim is skipped with a reason
    And the clean claim is approved
    And the duplicate claim still waits for the auditor

  @approvals
  Scenario: A stale version in a bulk call is never approved
    Given two claims of 30,000 INR wait at the auditor: one duplicate and one clean
    When the auditor bulk approves the clean claim with a stale version
    Then nothing is approved

  @approvals
  Scenario: The queue lists waiting claims and filters duplicates
    Given two claims of 30,000 INR wait at the auditor: one duplicate and one clean
    Then the review queue lists the clean claim
    And the duplicate filter lists the duplicate claim but not the clean claim
