from invoice import calculate_subtotal, apply_discount, calculate_tax, calculate_total


def test_calculate_subtotal():
    items = [(10.0, 2), (5.0, 3)]
    assert calculate_subtotal(items) == 35.0


def test_calculate_subtotal_empty():
    assert calculate_subtotal([]) == 0


def test_apply_discount():
    assert apply_discount(100.0, 10) == 90.0


def test_apply_discount_zero():
    assert apply_discount(50.0, 0) == 50.0


def test_calculate_tax():
    assert calculate_tax(100.0, 8) == 8.0


def test_calculate_total_no_discount_no_tax():
    items = [(20.0, 1)]
    assert calculate_total(items) == 20.0


def test_calculate_total_with_discount_and_tax():
    items = [(50.0, 2)]  # subtotal 100
    assert calculate_total(items, discount_percent=10, tax_rate=8) == 97.2
