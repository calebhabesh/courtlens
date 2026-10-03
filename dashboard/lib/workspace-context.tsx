"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  CustomViewDefinition,
  ImportConflictMode,
  PersonalWorkspaceState,
  RankingBoardDefinition,
  TierListDefinition,
  WorkspaceBundle,
  WorkspacePreferences
} from "./types";
import {
  addComparePlayer,
  addFavorite,
  clearCompareTray,
  createCustomView,
  createRankingBoard,
  createTierList,
  deleteCustomView,
  deleteRankingBoard,
  deleteTierList,
  exportWorkspaceBundle,
  getWorkspace,
  importWorkspaceBundle,
  removeComparePlayer,
  removeFavorite,
  reorderCustomViews,
  resetWorkspace,
  updateCustomView,
  updateRankingBoard,
  updateTierList,
  updateWorkspacePreferences,
  WorkspaceConflictError,
  type CreateCustomViewPayload,
  type CreateRankingBoardPayload,
  type CreateTierListPayload
} from "./workspace-client";

const DEFAULT_PREFERENCES: WorkspacePreferences = {
  density: "standard",
  identity_mode: "photos",
  counting_mode: "per_game",
  default_view_id: "overview",
  table_expanded: false,
  theme: "dark"
};

const DEFAULT_WORKSPACE: PersonalWorkspaceState = {
  workspace_id: "default",
  name: "Default Workspace",
  version: 1,
  views: [],
  favorites: [],
  compare_tray: [],
  ranking_boards: [],
  tier_lists: [],
  preferences: DEFAULT_PREFERENCES,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

export interface WorkspaceContextValue {
  workspace: PersonalWorkspaceState;
  version: number;
  isLoading: boolean;
  error: string | null;
  conflictNotice: string | null;
  clearConflictNotice: () => void;
  favorites: string[];
  isFavorite: (playerId: string) => boolean;
  toggleFavorite: (playerId: string) => Promise<void>;
  compareTray: string[];
  isInCompare: (playerId: string) => boolean;
  toggleCompare: (playerId: string) => Promise<void>;
  removeCompare: (playerId: string) => Promise<void>;
  clearCompare: () => Promise<void>;
  views: CustomViewDefinition[];
  defaultViewId: string;
  addCustomView: (payload: CreateCustomViewPayload) => Promise<PersonalWorkspaceState>;
  updateCustomView: (
    viewId: string,
    payload: Partial<CreateCustomViewPayload>
  ) => Promise<PersonalWorkspaceState>;
  deleteCustomView: (viewId: string) => Promise<PersonalWorkspaceState>;
  reorderCustomViews: (orderedIds: string[]) => Promise<PersonalWorkspaceState>;
  setDefaultView: (viewId: string) => Promise<PersonalWorkspaceState>;
  rankingBoards: RankingBoardDefinition[];
  saveRankingBoard: (
    board: CreateRankingBoardPayload & { id?: string }
  ) => Promise<PersonalWorkspaceState>;
  deleteRankingBoard: (boardId: string) => Promise<PersonalWorkspaceState>;
  tierLists: TierListDefinition[];
  saveTierList: (
    tierList: CreateTierListPayload & { id?: string }
  ) => Promise<PersonalWorkspaceState>;
  deleteTierList: (tierListId: string) => Promise<PersonalWorkspaceState>;
  preferences: WorkspacePreferences;
  updatePreferences: (prefs: Partial<WorkspacePreferences>) => Promise<PersonalWorkspaceState>;
  exportBundle: () => Promise<WorkspaceBundle>;
  importBundle: (bundle: WorkspaceBundle, mode?: ImportConflictMode) => Promise<PersonalWorkspaceState>;
  resetToDefaults: () => Promise<PersonalWorkspaceState>;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspace] = useState<PersonalWorkspaceState>(DEFAULT_WORKSPACE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getWorkspace();
      setWorkspace(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    getWorkspace()
      .then((data) => {
        if (!ignore) {
          setWorkspace(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load workspace");
          setIsLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  const handleConflict = useCallback(
    async (err: WorkspaceConflictError) => {
      setConflictNotice(
        `Version conflict: The workspace was updated elsewhere (server version: ${err.currentVersion}, attempted: ${err.expectedVersion}). Re-synced with latest state.`
      );
      await fetchLatest();
    },
    [fetchLatest]
  );

  const clearConflictNotice = useCallback(() => {
    setConflictNotice(null);
  }, []);

  const isFavorite = useCallback(
    (playerId: string) => {
      return workspace.favorites.includes(playerId);
    },
    [workspace.favorites]
  );

  const toggleFavorite = useCallback(
    async (playerId: string) => {
      const exists = workspace.favorites.includes(playerId);
      // Optimistic update
      setWorkspace((prev) => ({
        ...prev,
        favorites: exists
          ? prev.favorites.filter((id) => id !== playerId)
          : [...prev.favorites, playerId]
      }));

      try {
        const next = exists
          ? await removeFavorite(playerId, workspace.version)
          : await addFavorite(playerId, workspace.version);
        setWorkspace(next);
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        } else {
          // Rollback on non-conflict failure
          await fetchLatest();
          throw err;
        }
      }
    },
    [workspace.favorites, workspace.version, handleConflict, fetchLatest]
  );

  const isInCompare = useCallback(
    (playerId: string) => {
      return workspace.compare_tray.includes(playerId);
    },
    [workspace.compare_tray]
  );

  const toggleCompare = useCallback(
    async (playerId: string) => {
      const exists = workspace.compare_tray.includes(playerId);
      if (!exists && workspace.compare_tray.length >= 8) {
        throw new Error("Compare tray supports a maximum of 8 players (Block B07/B08 contract limit).");
      }

      setWorkspace((prev) => ({
        ...prev,
        compare_tray: exists
          ? prev.compare_tray.filter((id) => id !== playerId)
          : [...prev.compare_tray, playerId]
      }));

      try {
        const next = exists
          ? await removeComparePlayer(playerId, workspace.version)
          : await addComparePlayer(playerId, workspace.version);
        setWorkspace(next);
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        } else {
          await fetchLatest();
          throw err;
        }
      }
    },
    [workspace.compare_tray, workspace.version, handleConflict, fetchLatest]
  );

  const removeCompare = useCallback(
    async (playerId: string) => {
      setWorkspace((prev) => ({
        ...prev,
        compare_tray: prev.compare_tray.filter((id) => id !== playerId)
      }));
      try {
        const next = await removeComparePlayer(playerId, workspace.version);
        setWorkspace(next);
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        } else {
          await fetchLatest();
          throw err;
        }
      }
    },
    [workspace.version, handleConflict, fetchLatest]
  );

  const clearCompare = useCallback(async () => {
    setWorkspace((prev) => ({ ...prev, compare_tray: [] }));
    try {
      const next = await clearCompareTray(workspace.version);
      setWorkspace(next);
    } catch (err) {
      if (err instanceof WorkspaceConflictError) {
        await handleConflict(err);
      } else {
        await fetchLatest();
        throw err;
      }
    }
  }, [workspace.version, handleConflict, fetchLatest]);

  const handleAddCustomView = useCallback(
    async (payload: CreateCustomViewPayload) => {
      try {
        const next = await createCustomView(payload, workspace.version);
        setWorkspace(next);
        return next;
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        }
        throw err;
      }
    },
    [workspace.version, handleConflict]
  );

  const handleUpdateCustomView = useCallback(
    async (viewId: string, payload: Partial<CreateCustomViewPayload>) => {
      try {
        const next = await updateCustomView(viewId, payload, workspace.version);
        setWorkspace(next);
        return next;
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        }
        throw err;
      }
    },
    [workspace.version, handleConflict]
  );

  const handleDeleteCustomView = useCallback(
    async (viewId: string) => {
      try {
        const next = await deleteCustomView(viewId, workspace.version);
        setWorkspace(next);
        return next;
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        }
        throw err;
      }
    },
    [workspace.version, handleConflict]
  );

  const handleReorderCustomViews = useCallback(
    async (orderedIds: string[]) => {
      try {
        const next = await reorderCustomViews(orderedIds, workspace.version);
        setWorkspace(next);
        return next;
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        }
        throw err;
      }
    },
    [workspace.version, handleConflict]
  );

  const handleSetDefaultView = useCallback(
    async (viewId: string) => {
      try {
        const next = await updateWorkspacePreferences({ default_view_id: viewId }, workspace.version);
        setWorkspace(next);
        return next;
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        }
        throw err;
      }
    },
    [workspace.version, handleConflict]
  );

  const handleSaveRankingBoard = useCallback(
    async (board: CreateRankingBoardPayload & { id?: string }) => {
      try {
        let next: PersonalWorkspaceState;
        if (board.id) {
          const existing = workspace.ranking_boards.find((b) => b.id === board.id);
          const completeBoard: RankingBoardDefinition = {
            id: board.id,
            title: board.title,
            board_type: board.board_type ?? existing?.board_type ?? "overall",
            scope: board.scope ?? existing?.scope ?? null,
            notes: board.notes ?? existing?.notes ?? null,
            entries: board.entries ?? existing?.entries ?? [],
            created_at: existing?.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          next = await updateRankingBoard(board.id, completeBoard, workspace.version);
        } else {
          next = await createRankingBoard(board, workspace.version);
        }
        setWorkspace(next);
        return next;
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        }
        throw err;
      }
    },
    [workspace.ranking_boards, workspace.version, handleConflict]
  );

  const handleDeleteRankingBoard = useCallback(
    async (boardId: string) => {
      try {
        const next = await deleteRankingBoard(boardId, workspace.version);
        setWorkspace(next);
        return next;
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        }
        throw err;
      }
    },
    [workspace.version, handleConflict]
  );

  const handleSaveTierList = useCallback(
    async (tierList: CreateTierListPayload & { id?: string }) => {
      try {
        let next: PersonalWorkspaceState;
        if (tierList.id) {
          const existing = workspace.tier_lists.find((t) => t.id === tierList.id);
          const completeList: TierListDefinition = {
            id: tierList.id,
            title: tierList.title,
            description: tierList.description ?? existing?.description ?? null,
            tiers: tierList.tiers ?? existing?.tiers ?? [],
            created_at: existing?.created_at ?? new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          next = await updateTierList(tierList.id, completeList, workspace.version);
        } else {
          next = await createTierList(tierList, workspace.version);
        }
        setWorkspace(next);
        return next;
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        }
        throw err;
      }
    },
    [workspace.tier_lists, workspace.version, handleConflict]
  );

  const handleDeleteTierList = useCallback(
    async (tierListId: string) => {
      try {
        const next = await deleteTierList(tierListId, workspace.version);
        setWorkspace(next);
        return next;
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        }
        throw err;
      }
    },
    [workspace.version, handleConflict]
  );

  const handleUpdatePreferences = useCallback(
    async (prefs: Partial<WorkspacePreferences>) => {
      try {
        const next = await updateWorkspacePreferences(prefs, workspace.version);
        setWorkspace(next);
        return next;
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        }
        throw err;
      }
    },
    [workspace.version, handleConflict]
  );

  const handleExportBundle = useCallback(async () => {
    return exportWorkspaceBundle();
  }, []);

  const handleImportBundle = useCallback(
    async (bundle: WorkspaceBundle, mode: ImportConflictMode = "replace") => {
      try {
        const next = await importWorkspaceBundle(bundle, mode, workspace.version);
        setWorkspace(next);
        return next;
      } catch (err) {
        if (err instanceof WorkspaceConflictError) {
          await handleConflict(err);
        }
        throw err;
      }
    },
    [workspace.version, handleConflict]
  );

  const handleResetToDefaults = useCallback(async () => {
    try {
      const next = await resetWorkspace(workspace.version);
      setWorkspace(next);
      return next;
    } catch (err) {
      if (err instanceof WorkspaceConflictError) {
        await handleConflict(err);
      }
      throw err;
    }
  }, [workspace.version, handleConflict]);

  const value = useMemo<WorkspaceContextValue>(() => {
    return {
      workspace,
      version: workspace.version,
      isLoading,
      error,
      conflictNotice,
      clearConflictNotice,
      favorites: workspace.favorites,
      isFavorite,
      toggleFavorite,
      compareTray: workspace.compare_tray,
      isInCompare,
      toggleCompare,
      removeCompare,
      clearCompare,
      views: workspace.views,
      defaultViewId: workspace.preferences.default_view_id,
      addCustomView: handleAddCustomView,
      updateCustomView: handleUpdateCustomView,
      deleteCustomView: handleDeleteCustomView,
      reorderCustomViews: handleReorderCustomViews,
      setDefaultView: handleSetDefaultView,
      rankingBoards: workspace.ranking_boards,
      saveRankingBoard: handleSaveRankingBoard,
      deleteRankingBoard: handleDeleteRankingBoard,
      tierLists: workspace.tier_lists,
      saveTierList: handleSaveTierList,
      deleteTierList: handleDeleteTierList,
      preferences: workspace.preferences,
      updatePreferences: handleUpdatePreferences,
      exportBundle: handleExportBundle,
      importBundle: handleImportBundle,
      resetToDefaults: handleResetToDefaults,
      refresh: fetchLatest
    };
  }, [
    workspace,
    isLoading,
    error,
    conflictNotice,
    clearConflictNotice,
    isFavorite,
    toggleFavorite,
    isInCompare,
    toggleCompare,
    removeCompare,
    clearCompare,
    handleAddCustomView,
    handleUpdateCustomView,
    handleDeleteCustomView,
    handleReorderCustomViews,
    handleSetDefaultView,
    handleSaveRankingBoard,
    handleDeleteRankingBoard,
    handleSaveTierList,
    handleDeleteTierList,
    handleUpdatePreferences,
    handleExportBundle,
    handleImportBundle,
    handleResetToDefaults,
    fetchLatest
  ]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}
