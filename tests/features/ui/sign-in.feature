@ui @regression
Feature: Sign in
  Everyone signs in with a work email and password and lands on the screens for their role.

  @smoke @readonly @critical
  Scenario: The sign-in page shows what is needed
    Given a visitor is on the sign-in page
    Then the sign-in page shows email, password and a sign-in button

  @smoke @blocker
  Scenario Outline: Each role lands on its own home screen
    Given a visitor is on the sign-in page
    When the visitor signs in as the <who>
    Then the <who> home screen is shown

    Examples:
      | who          |
      | employee     |
      | manager      |
      | auditor      |
      | finance head |

  @critical
  Scenario: A wrong password is refused
    Given a visitor is on the sign-in page
    When the visitor submits the sign-in form with email "employee@expenseflow.test" and password "definitely-not-the-password"
    Then an error banner is shown on the sign-in page

  Scenario: Empty and malformed input is validated in the form
    Given a visitor is on the sign-in page
    When the visitor submits the empty sign-in form
    Then the sign-in page shows the message "Enter your email."
    And the sign-in page shows the message "Enter your password."
    When the visitor submits the sign-in form with email "not-an-email" and password "x"
    Then the sign-in page shows the message "Enter a valid email address."

  @critical @security
  Scenario: Role areas are guarded
    Given the employee is signed in to the browser
    When the signed-in employee opens "/manager/inbox"
    Then the page is not "/manager/inbox"

  @critical @security
  Scenario: A signed-out visitor is sent to sign in
    When the visitor opens "/employee/claims"
    Then the sign-in page is shown
