\# Version Fault - Regression Context



\## Versions



Working version: v1.0



Broken version: v2.0





\## Test Results



Pytest collected 7 tests.



\- 5 tests passed

\- 2 tests failed





\## Failing Test 1



Test:



`test\_apply\_discount`



Expected:



`90.0`



Actual:



`-900.0`





\## Failing Test 2



Test:



`test\_calculate\_total\_with\_discount\_and\_tax`



Expected:



`97.2`



Actual:



`-972.0`





\## Git Evidence



Regression commit:



`8deb5db demo\_project: apply\_discount drops percentage division (regression)`



Changed file:



`demo\_project/invoice.py`



Previous code:



```python

return subtotal - (subtotal \* discount\_percent / 100)

