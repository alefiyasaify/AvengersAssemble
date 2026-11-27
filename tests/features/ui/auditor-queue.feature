@ui @regression
Feature: Auditor review queue
  The auditor works through claims waiting at level 2, with duplicates held back from bulk approval.

  @critical @e2e
  Scenario: A duplicate cannot be ticked; the clean claim is approved in one click
    Given two claims of 30,000 INR wait at the auditor: one duplicate and one clean
    And the auditor is signed in to the browser
    When the auditor opens the review queue
    And the auditor searches for the duplicate claim
    Then the duplicate claim cannot be ticked
    And the duplicate claim row shows the "Duplicate" flag
    When the auditor ticks the clean claim and approves it in bulk
    Then a message says "1 approved"
    And the clean claim ends up approved in the system
    And the duplicate claim still waits for the auditor

  Scenario: The Duplicates screen lists duplicates only
    Given two claims of 30,000 INR wait at the auditor: one duplicate and one clean
    And the auditor is signed in to the browser
    When the auditor opens the duplicates screen
    And the auditor searches for the duplicate claim
    Then the clean claim is not listed on the duplicates screen
