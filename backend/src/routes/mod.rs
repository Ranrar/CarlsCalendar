use axum::{middleware, Router};
use crate::{
    middleware::auth_guard::require_auth,
    state::AppState,
};

mod auth;
mod admin;
mod calendar;
mod children;
mod compliance;
mod consent;
mod images;
mod pictograms;
mod schedules;
mod users;
mod visual_documents;

/// Build the full `/api/v1` router.
///
/// Public auth routes are left unprotected; every other route is wrapped in
/// the session-based [`require_auth`] middleware.
pub fn all_routes(state: AppState) -> Router<AppState> {
    let auth_mw = middleware::from_fn_with_state(state, require_auth);
    Router::new()
        .merge(auth::router())
        .merge(consent::router())   // public — no auth required
        .merge(calendar::public_router())
        .merge(
            Router::new()
                .merge(children::router())
                .merge(schedules::router())
                .merge(calendar::router())
                .merge(images::router())
                .merge(pictograms::router())
                .merge(admin::router())
                .merge(compliance::router())
                .merge(users::router())
                .merge(visual_documents::router())
                .route_layer(auth_mw),
        )
}
