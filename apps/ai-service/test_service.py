"""
Qis AI Service Direct Unit Test Suite
Validates:
1. health_check()
2. get_top_pairs() - live Binance data via CCXT
3. analyze_strategy() - precision Grid Distance & Section Gap optimization

Run: python test_service.py
"""

import os
import sys
import unittest

# Ensure stdout uses UTF-8 on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from main import (
    health_check,
    get_top_pairs,
    analyze_strategy,
    TopPairsRequest,
    StrategyAnalysisRequest,
)


class TestAiServiceDirect(unittest.TestCase):

    def test_01_health_check(self):
        """GET /health - returns status ok and service metadata"""
        res = health_check()
        self.assertEqual(res.get("status"), "ok")
        self.assertEqual(res.get("service"), "Qis AI Service")
        print("[PASS] Health Check:", res)

    def test_02_get_top_pairs(self):
        """POST /analyze/top-pairs - fetches live Binance data and returns Top 5 pairs"""
        req = TopPairsRequest(exchange="binance", candidateCount=5)
        res = get_top_pairs(req)

        self.assertIsInstance(res, list)
        self.assertEqual(len(res), 5)

        top_pair = res[0]
        self.assertEqual(top_pair.rank, 1)
        self.assertGreaterEqual(top_pair.confidenceScore, 50.0)
        self.assertGreater(len(top_pair.reasoning), 10)
        self.assertGreater(top_pair.volatility24hPercent, 0.0)

        print("\n[PASS] Top 5 AI Pair Recommendations from Binance:")
        for p in res:
            print(f"  #{p.rank} {p.pair} -- Score: {p.confidenceScore}% | Volatility: {p.volatility24hPercent}%")
            print(f"     Reasoning: {p.reasoning}")

    def test_03_analyze_strategy_btc(self):
        """POST /analyze/strategy - BTC/USDT - precision Grid Distance & Section Gap"""
        req = StrategyAnalysisRequest(
            exchange="binance",
            symbol="BTC/USDT",
            sectionCount=3,
            capital=10000.0
        )
        res = analyze_strategy(req)

        self.assertEqual(res["pair"], "BTC/USDT")
        self.assertGreaterEqual(res["confidenceScore"], 50.0)
        self.assertIn("overallReasoning", res)
        self.assertIn("recommendedSections", res)

        sections = res["recommendedSections"]
        self.assertEqual(len(sections), 3)

        print(f"\n[PASS] AI Strategy Optimization for BTC/USDT:")
        print(f"  Reasoning: {res['overallReasoning']}")
        for sec in sections:
            self.assertGreater(sec["gridCount"], 0)
            self.assertGreater(sec["gridDistancePercent"], 0.0)
            self.assertGreater(sec["sectionGapPercent"], 0.0)
            self.assertGreater(sec["minNetProfitPercent"], 0.0)
            print(
                f"  Section {sec['sectionIndex'] + 1}: "
                f"Grids={sec['gridCount']}, "
                f"Distance={sec['gridDistancePercent']}%, "
                f"Gap={sec['sectionGapPercent']}%, "
                f"MinProfit={sec['minNetProfitPercent']}%"
            )

    def test_04_analyze_strategy_sol(self):
        """POST /analyze/strategy - SOL/USDT high-volatility - wider grid params expected"""
        req = StrategyAnalysisRequest(
            exchange="binance",
            symbol="SOL/USDT",
            sectionCount=2,
            capital=5000.0
        )
        res = analyze_strategy(req)

        self.assertEqual(res["pair"], "SOL/USDT")
        sections = res["recommendedSections"]
        self.assertEqual(len(sections), 2)

        print(f"\n[PASS] AI Strategy Optimization for SOL/USDT (High Vol):")
        print(f"  Reasoning: {res['overallReasoning']}")
        for sec in sections:
            print(
                f"  Section {sec['sectionIndex'] + 1}: "
                f"Grids={sec['gridCount']}, "
                f"Distance={sec['gridDistancePercent']}%, "
                f"Gap={sec['sectionGapPercent']}%, "
                f"MinProfit={sec['minNetProfitPercent']}%"
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
