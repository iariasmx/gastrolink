import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

export class AuthGuard {
  static canActivate: CanActivateFn = (route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    return auth.loadCurrentUser().pipe(map(valid => {
      if (!valid) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
      if (route.data['superadmin'] && !auth.isSuperadmin()) return router.createUrlTree(['/admin/businesses'], { queryParams: { accessDenied: true } });
      const businessId = route.paramMap.get('businessId');
      if (businessId && !auth.canManageBusiness(businessId)) return router.createUrlTree(['/admin/businesses'], { queryParams: { accessDenied: true } });
      if (businessId) auth.selectBusiness(businessId);
      if (route.data['adminEntry']) {
        const businesses = auth.getUserBusinesses();
        if (!auth.isSuperadmin() && businesses.length === 1 && auth.canManageBusiness(businesses[0].id)) return router.createUrlTree(['/admin/businesses', businesses[0].id]);
        return router.createUrlTree(['/admin/businesses']);
      }
      return true;
    }));
  };
}
