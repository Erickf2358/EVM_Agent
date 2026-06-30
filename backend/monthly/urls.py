from rest_framework.routers import DefaultRouter
from .views import PeriodViewSet, PeriodProgressViewSet, EVMMetricViewSet

router = DefaultRouter()
router.register('periods', PeriodViewSet, basename='monthly-period')
router.register('progress', PeriodProgressViewSet, basename='monthly-progress')
router.register('evm', EVMMetricViewSet, basename='monthly-evm')

urlpatterns = router.urls
