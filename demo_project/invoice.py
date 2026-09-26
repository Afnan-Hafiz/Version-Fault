def calculate_subtotal(items):
    """items: list of (price, quantity) tuples"""
    return sum(price * quantity for price, quantity in items)


def apply_discount(subtotal, discount_percent):
    return subtotal - (subtotal * discount_percent / 100)


def calculate_tax(amount, tax_rate):
    return amount * tax_rate / 100


def calculate_total(items, discount_percent=0, tax_rate=0):
    subtotal = calculate_subtotal(items)
    discounted = apply_discount(subtotal, discount_percent)
    tax = calculate_tax(discounted, tax_rate)
    return round(discounted + tax, 2)
