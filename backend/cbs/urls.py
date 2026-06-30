from rest_framework.routers import DefaultRouter
from .views import CBSProjectGroupViewSet, CBSControlAccountViewSet, WorkPackageViewSet

router = DefaultRouter()
router.register('project-groups', CBSProjectGroupViewSet, basename='cbs-project-group')
router.register('control-accounts', CBSControlAccountViewSet, basename='cbs-control-account')
router.register('work-packages', WorkPackageViewSet, basename='cbs-work-package')

urlpatterns = router.urls
