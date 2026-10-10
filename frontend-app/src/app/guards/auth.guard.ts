import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { map } from "rxjs";
import { AuthService } from "../services/auth.service";

export class AuthGuard {
  static canActivate: CanActivateFn = (route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    return auth.loadCurrentUser().pipe(
      map((valid) => {
        if (!valid)
          return router.createUrlTree(["/login"], {
            queryParams: { returnUrl: state.url },
          });
        if (route.data["superadmin"] && !auth.isSuperadmin())
          return router.createUrlTree(["/admin/businesses"], {
            queryParams: { accessDenied: true },
          });
        const businessRef =
          route.paramMap.get("businessSlug") ??
          route.paramMap.get("businessId");
        if (businessRef) {
          const business = auth.getBusinessByIdOrSlug(businessRef);
          const staffOrdersOnly =
            route.data["tab"] === "orders" && business?.role === "staff";
          if (
            !business ||
            (!auth.canManageBusiness(business.id) && !staffOrdersOnly)
          )
            return router.createUrlTree(["/admin/businesses"], {
              queryParams: { accessDenied: true },
            });
          auth.selectBusiness(business.id);
          if (businessRef !== business.slug) {
            const oldPath = `/admin/businesses/${encodeURIComponent(businessRef)}`;
            return router.parseUrl(
              state.url.replace(
                oldPath,
                `/admin/businesses/${encodeURIComponent(business.slug)}`,
              ),
            );
          }
        }
        if (route.data["adminEntry"]) {
          const businesses = auth.getUserBusinesses();
          if (
            !auth.isSuperadmin() &&
            businesses.length === 1 &&
            auth.canManageBusiness(businesses[0].id)
          )
            return router.createUrlTree([
              "/admin/businesses",
              businesses[0].slug,
            ]);
          return router.createUrlTree(["/admin/businesses"]);
        }
        return true;
      }),
    );
  };
}
