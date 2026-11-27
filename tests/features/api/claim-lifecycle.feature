@claims @regression
Feature: Claim lifecycle
  An employee drafts a claim, edits it while it is a draft, submits it, and can withdraw it
  while it has not been approved by anyone.

  @blocker
  Scenario: A draft can be saved and submitted
    Given the employee has saved a draft with a travel expense of 2000 INR
    Then the claim status is "draft"
    When the employee submits the draft
    Then the claim is auto-approved

  Scenario: A submitted claim can no longer be edited but can be withdrawn
    Given the employee has submitted a travel claim of 8000 INR
    Then the claim can no longer be edited
    When the employee withdraws the claim
    Then the claim status is "withdrawn"
