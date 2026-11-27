@ui @regression
Feature: Capturing and submitting a claim in the browser
  An employee captures line items and receipts, sees the policy's verdict before sending,
  and submits. Clean small claims are approved straight away.

  @smoke @blocker @e2e
  Scenario: A clean 1,200 INR claim is drafted, saved and auto-approved
    Given the employee is signed in to the browser
    When the employee starts a new claim titled "BDD clean cab"
    And the employee fills line 1 with a cab expense of 1200 INR for "Airport drop"
    And the employee saves the draft
    Then the saved draft has the status "draft"
    When the employee reloads the page
    Then the claim title field still shows the title
    When the employee reviews and submits the claim
    Then the claim titled in this scenario has the status "approved"

  @blocker @e2e
  Scenario: Meals above the daily limit are rejected and the reason is shown before sending
    Given the employee is signed in to the browser
    When the employee starts a new claim titled "BDD meals"
    And the employee fills line 1 with a meals expense of 1800 INR for "Team dinner"
    And the employee adds line 2 with a travel expense of 8000 INR for "Client visit train"
    And the employee opens the review step
    Then the review step shows "Rejected by policy"
    And the review step shows "1,500"
    When the employee confirms the submission
    Then the claim titled in this scenario has the status "with manager"

  Scenario: A claim cannot be reviewed without a title or with an incomplete line
    Given the employee is signed in to the browser
    When the employee starts a new claim titled "BDD incomplete"
    And the employee tries to review the claim
    Then the form says a line is missing details

  Scenario: A hotel line asks for a city and shows the tier-1 limit
    Given the employee is signed in to the browser
    When the employee starts a new claim titled "BDD hotel"
    And the employee fills line 1 with a hotel stay of 12000.02 INR for 2 nights in a tier-1 city
    Then line 1 asks for a city
    And the live policy check mentions "6,000"

  Scenario: A submitted claim can be withdrawn from the browser
    Given the employee has submitted a travel claim of 8000 INR
    And the employee is signed in to the browser
    When the employee opens the claim in the browser
    And the employee withdraws the claim in the browser
    Then the claim in the system eventually has the status "withdrawn"

  @critical @security @e2e
  Scenario: Another employee's claim is not found in the browser
    Given the employee has submitted a travel claim of 8000 INR
    And the other employee is signed in to the browser
    When the employee opens the claim in the browser
    Then the page says the claim is not found
