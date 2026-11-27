@approvals @regression
Feature: Approval actions and separation of duties
  Approvers can approve, reject or send back. Nobody acts on their own claim, and
  one person approves at most one level of a claim.

  @critical
  Scenario: Reject needs a comment and keeps it
    Given the employee has submitted a travel claim of 8000 INR
    When the manager tries to reject the claim without a comment
    Then the request is refused with status 400
    When the manager rejects the claim with the comment "Not a business expense"
    Then the claim status is "rejected"

  Scenario: Send back needs a comment as well
    Given the employee has submitted a travel claim of 8000 INR
    When the manager tries to send the claim back without a comment
    Then the request is refused with status 400
    And the claim is still "with manager"

  @critical
  Scenario: Send back, fix and resubmit starts a new round at level 1
    Given the employee has submitted a travel claim of 8000 INR
    When the manager sends the claim back with the comment "Please correct the amount"
    Then the claim status is "sent back"
    When the employee edits the line to 7500 INR and resubmits
    Then the claim status is "with manager"
    And the claim is in a new approval round
    And the open step is level 1

  @critical
  Scenario: A send-back by the auditor restarts the whole chain
    Given the employee has submitted a travel claim of 30000 INR
    When the manager approves the claim
    And the auditor sends the claim back with the comment "Receipt is unreadable"
    And the employee edits the line to 29000 INR and resubmits
    Then the claim status is "with manager"
    And the open step is level 1
    And the approvals of the current round are levels ""

  @blocker
  Scenario: A manager cannot approve their own claim
    Given the manager has submitted a travel claim of 8000 INR
    Then the approval step is not assigned to the manager who filed the claim
    When the manager tries to approve the claim
    Then the request is refused
    And the claim is still "with manager"

  @blocker
  Scenario: A manager outside the reporting line cannot decide
    Given the employee has submitted a travel claim of 8000 INR
    When the other manager tries to approve the claim
    Then the request is refused
    And the claim is still "with manager"

  @blocker
  Scenario: One person cannot approve two levels of the same claim
    Given the employee has submitted a travel claim of 30000 INR
    When the manager approves the claim
    And the manager tries to approve the claim
    Then the request is refused
    And the claim is still "with auditor"

  @blocker
  Scenario: Two approvals at the same moment: one wins and the other is told so
    Given the employee has submitted a travel claim of 8000 INR
    When two approvals of the same step arrive at the same moment
    Then the request is refused with status 409

  @critical
  Scenario: A stale version is a conflict
    Given the employee has submitted a travel claim of 8000 INR
    When the manager approves the claim with a stale version
    Then the request is refused with status 409
    And the error code is "CLAIM_VERSION_CONFLICT"
