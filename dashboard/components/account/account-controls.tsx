"use client";

import { useState } from "react";
import { Button, IconButton, MenuTrigger } from "../ui/kit";
import { Menu, MenuItem, Popover } from "../ui/menu";
import { useAccount } from "../../lib/account-context";
import { FavoritePlayersList } from "./favorite-players";

/** Header star: the Favorite Players popover (desktop and tablet; phones use the drawer). */
export function FavoritesPopover() {
  const { favorites, status } = useAccount();
  const [open, setOpen] = useState(false);
  const count = status === "signed-in" ? favorites.length : 0;
  const label = count ? `Favorite players (${count})` : "Favorite players";
  return (
    <span className="account-header-control">
      <Popover align="right" open={open} onOpenChange={setOpen} className="favorite-players-popover" triggerLabel={label}
        renderTrigger={props => (
          <IconButton {...props} icon="star" filled={count > 0} tone="onBackground" size="md"
            label={label} />
        )}>
        <div className="favorite-players-panel" role="dialog" aria-label="Favorite players">
          <span className="favorite-players-title">Favorite Players</span>
          <FavoritePlayersList onNavigate={() => setOpen(false)} />
        </div>
      </Popover>
    </span>
  );
}

/** Header account control: "Sign in", or the account's name with Sign out. */
export function AccountMenu() {
  const { status, user, openSignIn, signOut } = useAccount();
  if (status === "loading") return null;
  if (status === "signed-out" || !user) {
    return (
      <span className="account-header-control">
        <Button variant="ghost" tone="onBackground" size="md" icon="user" onClick={() => openSignIn()}>Sign in</Button>
      </span>
    );
  }
  return (
    <span className="account-header-control">
      <Menu align="right" renderTrigger={props => (
        <MenuTrigger {...props} variant="ghost" tone="onBackground" size="md" icon="user">
          <span className="account-name">{user.name}</span>
        </MenuTrigger>
      )}>
        <div className="account-menu-who">{user.is_demo ? "Shared demo account" : user.email}</div>
        <MenuItem label="Sign out" onClick={() => void signOut()} />
      </Menu>
    </span>
  );
}

/** The phone drawer's account row. */
export function DrawerAccount({ onDone }: { onDone: () => void }) {
  const { status, user, openSignIn, signOut } = useAccount();
  if (status === "loading") return null;
  if (status === "signed-in" && user) {
    return (
      <div className="account-drawer-row">
        <span className="account-drawer-who"><span>{user.name}</span>{!user.is_demo && <small>{user.email}</small>}</span>
        <Button variant="secondary" size="md" onClick={() => { onDone(); void signOut(); }}>Sign out</Button>
      </div>
    );
  }
  return (
    <div className="account-drawer-row">
      <Button variant="secondary" size="md" icon="user" onClick={() => { onDone(); openSignIn(); }}>Sign in</Button>
    </div>
  );
}
