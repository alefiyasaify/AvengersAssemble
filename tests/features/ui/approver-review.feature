@ui @regression
Feature: Approver screens
  Managers and auditors work from an inbox or queue and decide on a side-by-side review screen.

  @smoke @blocker @e2e
  Scenario: The manager approves an 8,000 INR claim from the inbox
    Given the employee has submitted a travel claim of 8000 INR
    And the manager is signed in to the browser
    When the manager opens the claim from the inbox
    And the manager approves the claim on the review screen
    Then the claim in the system eventually has the status "approved"

  @critical
  Scenario: Reject needs a comment before it can be confirmed
    Given the employee has submitted a travel claim of 8000 INR
    And the manager is signed in to the browser
    When the manager opens the claim on the review screen
    And the manager starts to reject the claim on the review screen
    Then the reject confirmation button is disabled
    When the manager types the comment "Not a business expense" in the dialog
    Then the reject confirmation button is enabled
    When the manager confirms the rejection
    Then the claim in the system eventually has the status "rejected"

  @critical @e2e
  Scenario: Send back, fix in the browser and resubmit starts a new round
    Given the employee has submitted a travel claim of 8000 INR
    And the manager is signed in to the browser
    When the manager opens the claim on the review screen
    And the manager sends the claim back on the review screen with the comment "Please attach the right invoice"
    Then the claim in the system eventually has the status "sent back"
    Given the employee is signed in to the browser
    When the employee opens the claim in the browser
    Then the page says the claim was sent back
    When the employee changes the amount of line 1 to 7500 INR in the browser
    And the employee reviews and submits the claim
    Then the claim in the system eventually has the status "with manager"
    And the claim is in round 2 or later

  Scenario: The review screen shows the lines and the approval chain and supports the A shortcut
    Given the employee has submitted a travel claim of 8000 INR
    And the manager is signed in to the browser
    When the manager opens the claim on the review screen
    Then the review screen shows the line items and the approval chain
    When the manager presses the A key
    Then the claim in the system eventually has the status "approved"

  @critical @security
  Scenario: Someone who is not the assigned approver gets a read-only screen
    Given the employee has submitted a travel claim of 30000 INR
    When the manager approves the claim
    And the manager is signed in to the browser
    And the manager opens the claim on the review screen
    Then the review screen offers no approve button
    And the review screen shows a read-only notice
