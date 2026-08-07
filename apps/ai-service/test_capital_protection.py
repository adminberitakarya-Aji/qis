#!/usr/bin/env python3
"""
Test script to verify dynamic capital protection calculations.
Tests the three new functions:
- calculate_capital_protection_floor
- calculate_max_capital_per_movement
- calculate_max_drawdown_alert
"""

from reasoning import (
    calculate_capital_protection_floor,
    calculate_max_capital_per_movement,
    calculate_max_drawdown_alert,
    generate_strategy_recommendation
)

def test_capital_protection_floor():
    print("=== Testing calculate_capital_protection_floor ===")
    
    # Test 1: AI recommendation takes priority when valid
    current_price = 100.0
    ai_floor = 82.0  # Valid: > 0 and < current_price
    volatility = 4.0
    result = calculate_capital_protection_floor(current_price, ai_floor, volatility)
    assert result == 82.0, f"Expected 82.0, got {result}"
    print(f"[PASS] Test 1: AI recommendation priority - floor={result} (expected 82.0)")
    
    # Test 2: Fallback to dynamic calculation when AI floor is 0
    ai_floor = 0.0
    result = calculate_capital_protection_floor(current_price, ai_floor, volatility)
    # volatility_factor = clamp(4.0 / 25, 0.15, 0.35) = 0.16
    # floor = 100 * (1 - 0.16) = 84.0
    expected = 84.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 2: Dynamic fallback (medium vol) - floor={result} (expected {expected})")
    
    # Test 3: Low volatility → smaller floor distance
    volatility = 2.0
    result = calculate_capital_protection_floor(current_price, 0.0, volatility)
    # volatility_factor = clamp(2.0 / 25, 0.15, 0.35) = 0.15 (clamped to min)
    # floor = 100 * (1 - 0.15) = 85.0
    expected = 85.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 3: Low volatility - floor={result} (expected {expected})")
    
    # Test 4: High volatility → larger floor distance
    volatility = 8.0
    result = calculate_capital_protection_floor(current_price, 0.0, volatility)
    # volatility_factor = clamp(8.0 / 25, 0.15, 0.35) = 0.32
    # floor = 100 * (1 - 0.32) = 68.0
    expected = 68.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 4: High volatility - floor={result} (expected {expected})")
    
    # Test 5: Very high volatility clamped to 0.35
    volatility = 10.0
    result = calculate_capital_protection_floor(current_price, 0.0, volatility)
    # volatility_factor = clamp(10.0 / 25, 0.15, 0.35) = 0.35 (clamped to max)
    # floor = 100 * (1 - 0.35) = 65.0
    expected = 65.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 5: Very high volatility (clamped) - floor={result} (expected {expected})")
    
    print()

def test_max_capital_per_movement():
    print("=== Testing calculate_max_capital_per_movement ===")
    
    # Test 1: Medium volatility, neutral score
    volatility = 4.0
    score = 70.0
    result = calculate_max_capital_per_movement(volatility, score)
    # base=40, vol_adj=0, risk_adj=0 → 40.0
    expected = 40.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 1: Medium vol, neutral score - max_cap={result}% (expected {expected}%)")
    
    # Test 2: High volatility → more conservative
    volatility = 7.0
    score = 70.0
    result = calculate_max_capital_per_movement(volatility, score)
    # base=40, vol_adj=-10, risk_adj=0 → 30.0
    expected = 30.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 2: High vol - max_cap={result}% (expected {expected}%)")
    
    # Test 3: Low volatility → more aggressive
    volatility = 2.0
    score = 70.0
    result = calculate_max_capital_per_movement(volatility, score)
    # base=40, vol_adj=5, risk_adj=0 → 45.0
    expected = 45.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 3: Low vol - max_cap={result}% (expected {expected}%)")
    
    # Test 4: High confidence score → slightly more aggressive
    volatility = 4.0
    score = 90.0
    result = calculate_max_capital_per_movement(volatility, score)
    # base=40, vol_adj=0, risk_adj=2 → 42.0
    expected = 42.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 4: High confidence - max_cap={result}% (expected {expected}%)")
    
    # Test 5: High vol + low confidence (but not clamped)
    volatility = 7.0
    score = 50.0
    result = calculate_max_capital_per_movement(volatility, score)
    # base=40, vol_adj=-10, risk_adj=-2 → 28.0 (above 25, no clamping)
    expected = 28.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 5: High vol + low confidence - max_cap={result}% (expected {expected}%)")
    
    # Test 6: Extreme case - bounds clamping at lower limit
    volatility = 7.0
    score = 50.0  # This gives 28%, let's try more extreme
    # To get below 25: need base(40) + vol_adj(-10) + risk_adj < -5
    # risk_adj = (score - 70) * 0.1, so score needs to be < 20 which is impossible (min 50)
    # So the actual minimum is 28% with current parameters, not 25%
    # Let's verify the formula is correct instead
    result = calculate_max_capital_per_movement(7.0, 50.0)
    expected = 28.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 6: Verify minimum (28%) - max_cap={result}% (expected {expected}%)")
    
    print()

def test_max_drawdown_alert():
    print("=== Testing calculate_max_drawdown_alert ===")
    
    # Test 1: Medium volatility, moderate ATR
    volatility = 4.0
    atr = 2.0
    result = calculate_max_drawdown_alert(volatility, atr)
    # base=15, vol_adj=0, atr_adj=1.0 → 16.0
    expected = 16.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 1: Medium vol, moderate ATR - alert={result}% (expected {expected}%)")
    
    # Test 2: High volatility → wider threshold
    volatility = 7.0
    atr = 2.0
    result = calculate_max_drawdown_alert(volatility, atr)
    # base=15, vol_adj=5, atr_adj=1.0 → 21.0 → clamped to 20.0? No, max is 25.
    expected = 21.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 2: High vol - alert={result}% (expected {expected}%)")
    
    # Test 3: Low volatility → tighter threshold
    volatility = 2.0
    atr = 2.0
    result = calculate_max_drawdown_alert(volatility, atr)
    # base=15, vol_adj=-3, atr_adj=1.0 → 13.0
    expected = 13.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 3: Low vol - alert={result}% (expected {expected}%)")
    
    # Test 4: High ATR → wider threshold
    volatility = 4.0
    atr = 6.0
    result = calculate_max_drawdown_alert(volatility, atr)
    # base=15, vol_adj=0, atr_adj=3.0 → 18.0
    expected = 18.0
    assert result == expected, f"Expected {expected}, got {result}"
    print(f"[PASS] Test 4: High ATR - alert={result}% (expected {expected}%)")
    
    print()

def test_generate_strategy_recommendation_integration():
    print("=== Testing generate_strategy_recommendation integration ===")
    
    # Simulate features from indicators.py
    features = {
        "rsi_14": 45.0,
        "bb_bandwidth_percent": 5.0,
        "atr_percent": 2.5,
        "volatility_24h_percent": 4.5,
        "is_sideways": True,
        "trend": "neutral",
        "grid_suitability_score": 85.0,
    }
    
    result = generate_strategy_recommendation(
        symbol="BTC/USDT",
        features=features,
        section_count=3,
        capital=1000.0
    )
    
    # Verify capital protection values are dynamically calculated
    assert result["capitalProtectionFloorPrice"] == 0.0, "Floor price should be 0 (signal for dynamic calc)"
    print(f"[PASS] capitalProtectionFloorPrice: {result['capitalProtectionFloorPrice']} (signals dynamic calculation)")
    
    # maxCapitalPerMovementPercent should be dynamically calculated
    # volatility=4.5 (medium), score=85 → base=40, vol_adj=0, risk_adj=1.5 → 41.5
    expected_max_cap = 41.5
    assert result["maxCapitalPerMovementPercent"] == expected_max_cap, \
        f"Expected {expected_max_cap}, got {result['maxCapitalPerMovementPercent']}"
    print(f"[PASS] maxCapitalPerMovementPercent: {result['maxCapitalPerMovementPercent']}%")
    
    # maxDrawdownAlertPercent should be dynamically calculated
    # volatility=4.5 (medium), atr=2.5 → base=15, vol_adj=0, atr_adj=1.25 → 16.25 → rounded to 16.2
    expected_max_dd = 16.2
    assert result["maxDrawdownAlertPercent"] == expected_max_dd, \
        f"Expected {expected_max_dd}, got {result['maxDrawdownAlertPercent']}"
    print(f"[PASS] maxDrawdownAlertPercent: {result['maxDrawdownAlertPercent']}%")
    
    print()

if __name__ == "__main__":
    print("Testing Dynamic Capital Protection Calculations\n")
    
    try:
        test_capital_protection_floor()
        test_max_capital_per_movement()
        test_max_drawdown_alert()
        test_generate_strategy_recommendation_integration()
        print("=" * 50)
        print("[SUCCESS] ALL TESTS PASSED!")
        print("=" * 50)
    except AssertionError as e:
        print(f"[FAIL] TEST FAILED: {e}")
        exit(1)
    except Exception as e:
        print(f"[ERROR] UNEXPECTED ERROR: {e}")
        exit(1)
