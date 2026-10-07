import { Routes } from '@angular/router';
import { MenuComponent } from './components/menu/menu.component';
import { AdminComponent } from './components/admin/admin.component';
import { LoginComponent } from './components/login/login.component';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'admin', component: AdminComponent, canActivate: [AuthGuard.canActivate] },
  { path: 'menu/:slug', component: MenuComponent },
  { path: '', redirectTo: 'menu/tacos-el-pastor', pathMatch: 'full' },
  { path: '**', redirectTo: 'menu/tacos-el-pastor' }
];
