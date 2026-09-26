# Version Fault - Regression Context

## Versions

Working version: v1.0  
Broken version: v2.0

## Test Results

Pytest collected 7 tests.

- 5 tests passed
- 2 tests failed

## Failing Test 1

Test:

`test_apply_discount`

Expected:

`90.0`

Actual:

`-900.0`

## Failing Test 2

Test:

`test_calculate_total_with_discount_and_tax`

Expected:

`97.2`

Actual:

`-972.0`

## Git Evidence

Regression commit:

`8deb5db demo_project: apply_discount drops percentage division (regression)`

Changed file:

`demo_project/invoice.py`

Previous code:

```python
return subtotal - (subtotal * discount_percent / 100)

```

Broken code:

```python
return subtotal - (subtotal * discount_percent)
```

## Investigation Request

Use the test failures and Git evidence above to:

1. Identify the most likely regression-causing change.
2. Explain why the regression causes these test failures.
3. Propose the smallest targeted fix.
4. Apply the fix.
5. Run pytest again.
6. Verify that all tests pass.