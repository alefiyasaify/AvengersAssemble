@security @regression
Feature: Access control and visibility
  Employees see only their own claims, managers their reporting line, finance everything.
  Another person's claim is "not found", never "forbidden". Services enforce this, not just the UI.

  @blocker
  Scenario Outline: Another employee's claim and receipt are not found
    Given the employee has submitted a travel claim of 8000 INR
    When the other employee <action>
    Then the response is not found, never forbidden

    Examples:
      | action                              |
      | opens the claim                     |
      | opens the receipt of the claim      |
      | reads the audit timeline of the claim |

  @blocker
  Scenario: The owner can still open their own claim and receipt
    Given the employee has submitted a travel claim of 8000 INR
    When the employee opens the claim
    Then the response status is 200
    When the employee opens the receipt of the claim
    Then the response status is 200

  @blocker
  Scenario: A manager sees only their own reporting line
    Given the employee has submitted a travel claim of 8000 INR
    When the manager opens the claim
    Then the response status is 200
    When the other manager opens the claim
    Then the response is not found, never forbidden

  @blocker
  Scenario Outline: Nobody but the assigned approver can call the approval step
    Given the employee has submitted a travel claim of 8000 INR
    When the <who> calls the approval step directly with approve
    Then the request is refused
    And the claim is still "with manager"

    Examples:
      | who            |
      | employee       |
      | other employee |

  @critical
  Scenario Outline: Role matrix for finance and admin endpoints
    When <who> requests "<path>"
    Then the response status is <status>

    Examples: anonymous is not signed in
      | who       | path                         | status |
      | anonymous | /api/v1/claims               | 401    |
      | anonymous | /api/v1/payouts/batches      | 401    |

    Examples: employees and managers are not finance
      | who      | path                         | status |
      | employee | /api/v1/review-queue         | 403    |
      | manager  | /api/v1/review-queue         | 403    |
      | employee | /api/v1/payouts/batches      | 403    |
      | manager  | /api/v1/admin/users          | 403    |
      | auditor  | /api/v1/admin/users          | 403    |

    Examples: allowed
      | who      | path                         | status |
      | auditor  | /api/v1/review-queue         | 200    |
      | head     | /api/v1/admin/users          | 200    |
      | head     | /api/v1/payouts/eligible     | 200    |
      | employee | /api/v1/me                   | 200    |
