"""공백 후보 탐지 detectors.

V0는 AdjacentGapDetector 단일.
V1+ 에서 CrossDomainGap, FadedRegion, EmergingSparse, MethodDomainImbalance,
IsolatedHighImpact 추가.
"""

from .adjacent_gap import AdjacentGapDetector

__all__ = ["AdjacentGapDetector"]
