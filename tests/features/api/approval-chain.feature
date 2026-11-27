@approvals @regression
Feature: Approval chain
  The chain is chosen from the payable total when the claim is submitted:
  the manager always, the auditor above 25,000 INR, the finance head above 1,00,000 INR.

  @blocker
  Scenario Outline: The chain follows the payable total
    When the employee submits a travel expense of <amount> INR
    Then the approval levels required are "<levels>"
    And the claim status is "with manager"

    Examples: manager only
      | amount   | levels |
      | 8000     | 1      |
      | 25000    | 1      |

    Examples: manager and auditor
      | amount    | levels |
      | 25000.01  | 1,2    |
      | 100000    | 1,2    |

    Examples: manager, auditor and finance head
      | amount     | levels |
      | 100000.01  | 1,2,3  |

  @blocker @smoke
  Scenario: 8,000 INR stops at the manager
    Given the employee has submitted a travel claim of 8000 INR
    When the manager approves the claim
    Then the claim status is "approved"

  @blocker
  Scenario: 30,000 INR needs the manager and then the auditor
    Given the employee has submitted a travel claim of 30000 INR
    When the manager approves the claim
    Then the claim status is "with auditor"
    When the auditor approves the claim
    Then the claim status is "approved"
    And the approvals of the current round are levels "1,2"

  @blocker
  Scenario: 1,20,000 INR needs the manager, the auditor and the finance head in order
    Given the employee has submitted a travel claim of 120000 INR
    When the manager approves the claim
    Then the claim status is "with auditor"
    When the auditor approves the claim
    Then the claim status is "with finance head"
    When the finance head approves the claim
    Then the claim status is "approved"
    And the approvals of the current round are levels "1,2,3"
