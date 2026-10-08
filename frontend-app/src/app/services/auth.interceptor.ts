import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { API_URL } from './api.config';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const authorized = !!token && request.url.startsWith(`${API_URL}/`) && request.url !== `${API_URL}/auth/login`;
  const outgoing = authorized ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
  return next(outgoing).pipe(catchError(error => {
    if (authorized && error.status === 401 && auth.token() === token) {
      auth.clearSession();
      if (router.url.startsWith('/admin')) void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
    }
    return throwError(() => error);
  }));
};
