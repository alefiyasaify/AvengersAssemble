@mobile @ui @regression
Feature: Claim capture on a phone
  Employees capture claims on a phone: no sideways scrolling, a decimal keypad for amounts
  and the policy finding shown inline.

  @critical
  Scenario: The capture form fits the phone and shows the live policy finding
    Given the employee is signed in to the browser
    When the employee starts a new claim titled "BDD mobile"
    Then the page has no sideways scrolling
    When the employee fills line 1 with a meals expense of 1800 INR for "Team dinner"
    Then the amount field of line 1 uses the decimal keypad
    And the live policy check mentions "1,500"
    And the page has no sideways scrolling

  Scenario: My claims is usable at phone width
    Given the employee is signed in to the browser
    Then My claims shows its summary
    And the page has no sideways scrolling
