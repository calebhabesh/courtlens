"use client";

import { useState } from "react";
import { Button, IconButton, MenuTrigger } from "../ui/kit";
import { Menu, MenuItem, Popover } from "../ui/menu";
import { Modal } from "../ui/modal";
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

/** Confirms deleting the signed-in account (accounts plan); the demo account has none. */
function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { deleteAccount } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={open} onClose={onClose} title="Delete account" className="account-dialog"
      description="Your account, favourite players and Ask conversations are deleted now. This can't be undone.">
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="account-confirm">
        <Button variant="secondary" size="md" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button variant="danger" size="md" loading={busy} onClick={() => void confirm()}>Delete account</Button>
      </div>
    </Modal>
  );
}

/** Header account control: "Sign in", or the account's name with Sign out. */
export function AccountMenu() {
  const { status, user, openSignIn, signOut } = useAccount();
  const [deleting, setDeleting] = useState(false);
  if (status === "loading") return null;
  if (status === "signed-out" || !user) {
    return (
      <span className="account-header-control">
        <Button variant="ghost" tone="onBackground" size="md" icon="user" onClick={() => openSignIn()}><span className="account-label">Sign in</span></Button>
      </span>
    );
  }
  return (
    <span className="account-header-control">
      <Menu align="right" renderTrigger={props => (
        <MenuTrigger {...props} variant="ghost" tone="onBackground" size="md" icon="user">
          <span className="account-label account-name">{user.name}</span>
        </MenuTrigger>
      )}>
        <div className="account-menu-who">{user.is_demo ? "Shared demo account" : user.email}</div>
        <MenuItem label="Sign out" onClick={() => void signOut()} />
        {!user.is_demo && <MenuItem label="Delete account" onClick={() => setDeleting(true)} />}
      </Menu>
      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
    </span>
  );
}

/** The phone drawer's account row. */
export function DrawerAccount({ onDone }: { onDone: () => void }) {
  const { status, user, openSignIn, signOut } = useAccount();
  const [deleting, setDeleting] = useState(false);
  if (status === "loading") return null;
  if (status === "signed-in" && user) {
    return (
      <div className="account-drawer-row">
        <span className="account-drawer-who"><span>{user.name}</span>{!user.is_demo && <small>{user.email}</small>}</span>
        <span className="account-drawer-actions">
          {!user.is_demo && <Button variant="text" size="md" onClick={() => setDeleting(true)}>Delete</Button>}
          <Button variant="secondary" size="md" onClick={() => { onDone(); void signOut(); }}>Sign out</Button>
        </span>
        <DeleteAccountDialog open={deleting} onClose={() => { setDeleting(false); }} />
      </div>
    );
  }
  return (
    <div className="account-drawer-row">
      <Button variant="secondary" size="md" icon="user" onClick={() => { onDone(); openSignIn(); }}>Sign in</Button>
    </div>
  );
}
