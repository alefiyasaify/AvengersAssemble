@payout @regression
Feature: Payout batches
  Approval decides that money is owed; a batch decides when and in which bank file it is paid.
  The person who creates a batch is never the person who verifies it (maker-checker).

  @blocker @e2e
  Scenario: Create, verify, export and mark paid; the bank file adds up
    Given 2 payable claims are selected for payout
    When the finance head creates a payout batch
    Then the batch status is "DRAFT"
    And the batch total equals the sum of its claims
    When the auditor verifies the batch
    Then the batch status is "VERIFIED"
    And the verifier is not the creator of the batch
    When the finance head exports the batch
    Then the batch status is "EXPORTED"
    And the bank file has one detail row per claim
    And the bank file trailer total equals the batch total
    When the finance head marks the batch as paid
    Then the batch status is "PAID"
    And every claim in the batch is paid

  @blocker @security
  Scenario: The maker cannot verify their own batch
    Given 1 payable claim is selected for payout
    When the finance head creates a payout batch
    And the finance head tries to verify the batch they created
    Then the request is refused

  @critical
  Scenario: A batch must be verified before export and cannot be paid twice
    Given 1 payable claim is selected for payout
    When the finance head creates a payout batch
    And the finance head tries to export the unverified batch
    Then the request is refused with status 409
    When the auditor verifies the batch
    And the finance head exports the batch
    And the finance head marks the batch as paid
    And the finance head tries to mark the batch as paid again
    Then the request is refused with status 409

  Scenario: Cancelling a batch returns its claim to the payable list
    Given 1 payable claim is selected for payout
    When the finance head creates a payout batch
    Then the claim is not offered for payout again
    When the finance head cancels the batch
    Then the claim returns to the payable list

  @critical @security
  Scenario Outline: Only the finance head can create payout batches
    Given 1 payable claim is selected for payout
    When the <who> tries to create a payout batch
    Then the request is refused with status 403
    And the <who> cannot list payable claims

    Examples:
      | who      |
      | employee |
      | manager  |
      | auditor  |
