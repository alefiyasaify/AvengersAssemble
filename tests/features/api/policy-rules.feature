@policy @regression
Feature: Policy engine
  As the finance team
  I want every expense line checked against the active policy
  So that overspend is stopped automatically and risky claims are routed to a person

  # "up to X" passes at X; "above X" breaches (ARD 5). Limits are data, never hard-coded.

  @critical
  Scenario Outline: Meals are limited per employee per day
    When the employee submits a meals expense of <amount> INR
    Then the "MEALS_DAILY_CAP" rule <verdict> the line

    Examples: at or below the limit
      | amount  | verdict                 |
      | 1500    | does not reject         |
      | 1499.99 | does not reject         |

    Examples: above the limit
      | amount  | verdict |
      | 1500.01 | rejects |
      | 1800    | rejects |

  @critical
  Scenario: Several meals on the same day count together
    When the employee submits two meals expenses of 900 INR each on the same day
    Then the "MEALS_DAILY_CAP" rule rejects the line

  @critical
  Scenario Outline: Hotel nights are limited by city tier
    When the employee submits a hotel stay of <total> INR for 2 nights in a <tier> city
    Then the "HOTEL_NIGHT_CAP" rule <verdict> the line

    Examples: tier-1 city, 6,000 per night
      | tier   | total    | verdict         |
      | tier-1 | 12000    | does not reject |
      | tier-1 | 12000.02 | rejects         |

    Examples: other cities, 4,000 per night
      | tier  | total   | verdict         |
      | other | 8000    | does not reject |
      | other | 8000.02 | rejects         |

  @critical
  Scenario Outline: A local cab trip is limited per trip
    When the employee submits a cab expense of <amount> INR
    Then the "CAB_TRIP_CAP" rule <verdict> the line

    Examples:
      | amount  | verdict         |
      | 2000    | does not reject |
      | 2000.01 | rejects         |

  @critical
  Scenario Outline: A receipt is mandatory above 500 INR
    When the employee submits a travel expense of <amount> INR without a receipt
    Then the "RECEIPT_REQUIRED" rule <verdict> the line

    Examples:
      | amount | verdict         |
      | 500    | does not reject |
      | 500.01 | rejects         |

  Scenario: A receipt above 500 INR satisfies the rule
    When the employee submits a travel expense of 5000 INR
    Then the "RECEIPT_REQUIRED" rule does not reject the line

  @critical
  Scenario: The same vendor, amount and date is a duplicate even if case and spacing differ
    Given the employee has submitted the same vendor, amount and date twice
    Then the claim has a "DUPLICATE_LINE" finding with outcome "ROUTE"
    And the claim status is "with manager"

  @critical
  Scenario: The same receipt file on another claim is a duplicate
    Given the employee has submitted the same receipt file on two claims
    Then the claim has a "DUPLICATE_LINE" finding with outcome "ROUTE"

  Scenario: Weekend spend is flagged but never rejected
    When the employee submits a travel expense of 1000 INR on a Saturday
    Then the claim has a "WEEKEND_SPEND" finding with outcome "FLAG"

  @critical
  Scenario: A rejected line is left out of the payable total and the rest continues
    When the employee submits a meals expense of 1800 INR and a travel expense of 8000 INR
    Then exactly 1 line is rejected by policy
    And the total is 9800 INR
    And the payable total is 8000 INR
    And the claim status is "with manager"

  @critical
  Scenario: A claim whose lines are all rejected is rejected
    When the employee submits a cab expense of 2500 INR
    Then the claim is rejected because of "CAB_TRIP_CAP"
    And the payable total is 0 INR

  @blocker @smoke
  Scenario Outline: A clean claim up to 5,000 INR is approved automatically
    When the employee submits a <kind> expense of <amount> INR
    Then the claim status is "<status>"

    Examples:
      | kind   | amount  | status       |
      | cab    | 1200    | approved     |
      | travel | 5000    | approved     |
      | travel | 5000.01 | with manager |
