@approvals @regression
Feature: Delegation
  A manager on leave can delegate one approval level for up to 30 days.

  @critical
  Scenario: A delegate approves on behalf of the manager and the audit trail shows both names
    Given the manager has delegated level 1 to the delegate
    And the employee has submitted a travel claim of 8000 INR
    Then the delegate sees the claim in their inbox
    When the delegate approves the claim
    Then the claim status is "approved"
    And the approved step shows the delegate acting on behalf of the manager
    And the audit timeline shows the delegate acting on behalf of the manager

  @critical
  Scenario Outline: A delegation has limits
    When the manager tries to delegate for <days> days
    Then the request is refused with status <status>

    Examples:
      | days | status |
      | 31   | 400    |

  Scenario: A manager cannot delegate to themselves
    When the manager tries to delegate to themselves
    Then the request is refused

  @critical
  Scenario: A revoked delegation stops working
    Given the manager delegated level 1 to the delegate and then revoked it
    And the employee has submitted a travel claim of 8000 INR
    Then the delegate does not see the claim in their inbox
    When the delegate tries to approve the claim
    Then the request is refused
