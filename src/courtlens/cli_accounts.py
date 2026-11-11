"""Operator commands for invite-only accounts and the demo account (finish plan F04)."""

from __future__ import annotations

import json

import typer

from courtlens.database import SessionLocal
from courtlens.services import accounts
from courtlens.services.accounts import AccountError


def _password(value: str | None) -> str:
    if value:
        return value
    return str(typer.prompt("Password", hide_input=True, confirmation_prompt=True))


def _fail(error: AccountError) -> None:
    typer.echo(f"error: {error}", err=True)
    raise typer.Exit(code=1)


def register(app: typer.Typer) -> None:
    @app.command("create-user")
    def create_user_command(
        email: str = typer.Option(..., help="Sign-in email (the invite)."),
        name: str | None = typer.Option(None, help="Name shown in the header."),
        password: str | None = typer.Option(
            None, help="Leave out to be prompted (recommended: keeps it out of shell history)."
        ),
    ) -> None:
        """Create an account. There is no public sign-up."""
        with SessionLocal() as session:
            try:
                user = accounts.create_user(session, email, _password(password), name)
            except AccountError as error:
                _fail(error)
                return
            typer.echo(json.dumps({"created": user.email, "id": user.id}))

    @app.command("set-password")
    def set_password_command(
        email: str = typer.Option(...),
        password: str | None = typer.Option(None, help="Leave out to be prompted."),
    ) -> None:
        """Set a password and enable the account (also enables a pre-F04 user row)."""
        with SessionLocal() as session:
            try:
                user = accounts.set_password(session, email, _password(password))
            except AccountError as error:
                _fail(error)
                return
            typer.echo(json.dumps({"updated": user.email, "signed_out": True}))

    @app.command("disable-user")
    def disable_user_command(email: str = typer.Option(...)) -> None:
        """Stop an account signing in and end its sessions. Its favourites are kept."""
        with SessionLocal() as session:
            try:
                user = accounts.disable_user(session, email)
            except AccountError as error:
                _fail(error)
                return
            typer.echo(json.dumps({"disabled": user.email}))

    @app.command("revoke-sessions")
    def revoke_sessions_command(email: str = typer.Option(...)) -> None:
        """Sign an account out on every device."""
        with SessionLocal() as session:
            try:
                user = accounts.revoke_sessions(session, email)
            except AccountError as error:
                _fail(error)
                return
            typer.echo(json.dumps({"signed_out": user.email}))

    @app.command("list-users")
    def list_users_command() -> None:
        """Accounts and whether each can sign in."""
        from sqlalchemy import select

        from courtlens.models import User

        with SessionLocal() as session:
            for user in session.scalars(select(User).order_by(User.created_at)):
                typer.echo(
                    json.dumps(
                        {
                            "email": user.email,
                            "name": user.display_name,
                            "enabled": user.account_enabled,
                            "demo": user.is_demo,
                            "favorites": len(accounts.favorite_ids(session, user)),
                        }
                    )
                )

    @app.command("seed-demo-account")
    def seed_demo_account_command() -> None:
        """Create the one-click demo account (idempotent). A new one gets the seeded list."""
        with SessionLocal() as session:
            user = accounts.seed_demo_account(session)
            typer.echo(
                json.dumps(
                    {"demo": user.email, "favorites": len(accounts.favorite_ids(session, user))}
                )
            )

    @app.command("reset-demo-favorites")
    def reset_demo_favorites_command() -> None:
        """Restore the demo's shared favourites to the seeded list (the nightly timer runs this)."""
        with SessionLocal() as session:
            try:
                count = accounts.reset_demo_favorites(session)
            except AccountError as error:
                _fail(error)
                return
            typer.echo(json.dumps({"demo_favorites": count}))

    @app.command("import-workspace-favorites")
    def import_workspace_favorites_command(
        email: str = typer.Option(..., help="Account that receives the list."),
        workspace_id: str = typer.Option("default", help="Install-wide workspace to copy from."),
    ) -> None:
        """Copy the old install-wide favourites into an account (one-time, local workbench)."""
        from courtlens.services.personal_state import get_or_create_workspace

        with SessionLocal() as session:
            user = accounts.find_user(session, email)
            if user is None or not user.account_enabled:
                _fail(AccountError("no enabled account with that email"))
                return
            added, skipped = 0, []
            for player_id in get_or_create_workspace(session, workspace_id).favorites:
                try:
                    before = len(accounts.favorite_ids(session, user))
                    after = len(accounts.add_favorite(session, user, player_id))
                    added += after - before
                except AccountError:
                    skipped.append(player_id)
            typer.echo(json.dumps({"added": added, "skipped": skipped}))
