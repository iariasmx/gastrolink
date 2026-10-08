import { Routes } from "@angular/router";
import { MenuComponent } from "./components/menu/menu.component";
import { AdminComponent } from "./components/admin/admin.component";
import { LoginComponent } from "./components/login/login.component";
import { AuthGuard } from "./guards/auth.guard";
import { BusinessListComponent } from "./components/business-list/business-list.component";
import { BusinessFormComponent } from "./components/business-form/business-form.component";

export const routes: Routes = [
  { path: "login", component: LoginComponent },
  {
    path: "admin",
    component: BusinessListComponent,
    canActivate: [AuthGuard.canActivate],
    data: { adminEntry: true },
  },
  {
    path: "admin/businesses",
    component: BusinessListComponent,
    canActivate: [AuthGuard.canActivate],
    runGuardsAndResolvers: "always",
  },
  {
    path: "admin/businesses/new",
    component: BusinessFormComponent,
    canActivate: [AuthGuard.canActivate],
    data: { superadmin: true },
  },
  {
    path: "admin/businesses/:businessSlug/edit",
    component: BusinessFormComponent,
    canActivate: [AuthGuard.canActivate],
    data: { superadmin: true },
  },
  {
    path: "admin/businesses/:businessSlug/menu",
    component: AdminComponent,
    canActivate: [AuthGuard.canActivate],
    data: { tab: "menu" },
  },
  {
    path: "admin/businesses/:businessSlug/settings",
    component: AdminComponent,
    canActivate: [AuthGuard.canActivate],
    data: { tab: "settings" },
  },
  {
    path: "admin/businesses/:businessSlug",
    component: AdminComponent,
    canActivate: [AuthGuard.canActivate],
    data: { tab: "overview" },
  },
  { path: "menu/:slug", component: MenuComponent },
  { path: "", redirectTo: "menu/tacos-el-pastor", pathMatch: "full" },
  { path: "**", redirectTo: "menu/tacos-el-pastor" },
];
