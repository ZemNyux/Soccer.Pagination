import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    useTable,
    tableFeatures,
    rowPaginationFeature,
    createPaginatedRowModel,
    createColumnHelper,
} from '@tanstack/react-table';

import './App.css';

const API_BASE_URL = '/api';

const columnHelper = createColumnHelper();

const playersTableFeatures = tableFeatures({
    rowPaginationFeature,
    paginatedRowModel: createPaginatedRowModel(),
});

export default function App() {
    const [activeTab, setActiveTab] = useState('players');
    const [players, setPlayers] = useState([]);
    const [teams, setTeams] = useState([]);
    const [teamOptions, setTeamOptions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [playerForm, setPlayerForm] = useState({ id: 0, name: '', age: '', position: '', teamId: '' });
    const [teamForm, setTeamForm] = useState({ id: 0, name: '', coach: '' });
    const [isEditing, setIsEditing] = useState(false);

    // пагінація на @tanstack/react-table ---
    const playersColumns = useMemo(
        () => [
            columnHelper.accessor('id', { header: 'ID' }),
            columnHelper.accessor('name', { header: "Ім'я" }),
            columnHelper.accessor('age', { header: 'Вік' }),
            columnHelper.accessor('position', { header: 'Позиція' }),
            columnHelper.accessor('team', { header: 'Команда' }),
        ],
        []
    );
    // Колонки для команд
    const teamsColumns = useMemo(
        () => [
            columnHelper.accessor('id', { header: 'ID' }),
            columnHelper.accessor('name', { header: 'Назва' }),
            columnHelper.accessor('coach', { header: 'Тренер' }),
        ],
        []
    );

    // Состояние пагинации для команд (по 5 команд на странице)
    const [teamsPagination, setTeamsPagination] = useState({
        pageIndex: 0,
        pageSize: 5,
    });

    // Экземпляр таблицы TanStack для команд
    const teamsTable = useTable({
        features: playersTableFeatures,
        data: teams,
        columns: teamsColumns,
        state: { pagination: teamsPagination },
        onPaginationChange: setTeamsPagination,
    });

    // Отфильтрованные команды для текущей страницы
    const paginatedTeams = teamsTable.getRowModel().rows.map((row) => row.original);

    // стан пагінації: pageIndex (0-based), pageSize = 5 футболістів на сторінці
    const [pagination, setPagination] = useState({
        pageIndex: 0,
        pageSize: 5, // !!!
    });

    const playersTable = useTable({
        features: playersTableFeatures,
        data: players,
        columns: playersColumns,
        state: { pagination },
        onPaginationChange: setPagination,
    });

    // рядки поточної сторінки (бібліотека вже відфільтрувала)
    const paginatedPlayers = playersTable.getRowModel().rows.map((row) => row.original);

    const resetForm = useCallback(() => {
        setPlayerForm({ id: 0, name: '', age: '', position: '', teamId: '' });
        setTeamForm({ id: 0, name: '', coach: '' });
        setIsEditing(false);
    }, []);

    const refreshTeamOptions = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/teams`);
            if (!response.ok) return;
            const data = await response.json();
            setTeamOptions(data);
        } catch {
            setTeamOptions([]);
        }
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const endpoint = activeTab === 'players' ? 'players' : 'teams';
            const response = await fetch(`${API_BASE_URL}/${endpoint}`);
            if (!response.ok) throw new Error(`Помилка завантаження: ${response.statusText}`);
            const data = await response.json();
            if (activeTab === 'players') setPlayers(data);
            else setTeams(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [activeTab]);

    useEffect(() => {
        let ignore = false;
        const load = async () => {
            resetForm();
            // скидаємо на першу сторінку при зміні вкладки
            setTeamsPagination((prev) => ({ ...prev, pageIndex: 0 }));
            setLoading(true);
            setError(null);
            try {
                const endpoint = activeTab === 'players' ? 'players' : 'teams';
                const response = await fetch(`${API_BASE_URL}/${endpoint}`);
                if (!response.ok) throw new Error(`Помилка завантаження: ${response.statusText}`);
                const data = await response.json();

                if (activeTab === 'players') {
                    const teamsResponse = await fetch(`${API_BASE_URL}/teams`);
                    const teamsData = teamsResponse.ok ? await teamsResponse.json() : [];
                    if (!ignore) {
                        setPlayers(data);
                        setTeamOptions(teamsData);
                    }
                } else {
                    if (!ignore) {
                        setTeams(data);
                        setTeamOptions(data);
                    }
                }
            } catch (err) {
                if (!ignore) setError(err.message);
            } finally {
                if (!ignore) setLoading(false);
            }
        };
        load();
        return () => { ignore = true; };
    }, [activeTab, resetForm]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const isPlayer = activeTab === 'players';
        const endpoint = isPlayer ? 'players' : 'teams';
        const formData = isPlayer
            ? { ...playerForm, age: Number(playerForm.age), teamId: playerForm.teamId ? Number(playerForm.teamId) : null }
            : teamForm;
        const url = isEditing ? `${API_BASE_URL}/${endpoint}/${formData.id}` : `${API_BASE_URL}/${endpoint}`;
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            if (!response.ok) throw new Error('Не вдалося зберегти дані');
            resetForm();
            fetchData();
            if (!isPlayer) refreshTeamOptions();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleEdit = (item) => {
        setIsEditing(true);
        if (activeTab === 'players') {
            setPlayerForm({
                id: item.id,
                name: item.name || '',
                age: item.age ?? '',
                position: item.position || '',
                teamId: item.teamId ?? '',
            });
        } else {
            setTeamForm({
                id: item.id,
                name: item.name || '',
                coach: item.coach || '',
            });
        }
    };

    const [confirmDialog, setConfirmDialog] = useState(null);

    const requestDelete = (id, name) => {
        setConfirmDialog({ id, name });
    };

    const cancelDelete = () => {
        setConfirmDialog(null);
    };

    const confirmDelete = async () => {
        if (!confirmDialog) return;
        const id = confirmDialog.id;
        setConfirmDialog(null);
        const endpoint = activeTab === 'players' ? 'players' : 'teams';
        try {
            const response = await fetch(`${API_BASE_URL}/${endpoint}/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Помилка при видаленні');
            fetchData();
            if (activeTab === 'teams') refreshTeamOptions();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="app">
            <header className="header">
                <div className="header-inner">
                    <div className="brand">
                        <span className="brand-icon">⚽</span>
                        <div className="brand-text">
                            <span className="brand-title">Футбольна ліга</span>
                            <span className="brand-sub">Менеджер гравців та команд</span>
                        </div>
                    </div>
                    <nav className="nav">
                        <button
                            className={`nav-btn ${activeTab === 'players' ? 'active' : ''}`}
                            onClick={() => setActiveTab('players')}
                        >
                            Гравці
                        </button>
                        <button
                            className={`nav-btn ${activeTab === 'teams' ? 'active' : ''}`}
                            onClick={() => setActiveTab('teams')}
                        >
                            Команди
                        </button>
                    </nav>
                </div>
            </header>

            <main className="main">
                {error && <div className="alert">{error}</div>}

                <div className="layout">
                    <section className="panel form-panel">
                        <div className="panel-head">
                            <h2>{isEditing ? 'Редагувати' : 'Додати'} {activeTab === 'players' ? 'гравця' : 'команду'}</h2>
                        </div>
                        <form onSubmit={handleSubmit} className="form">
                            {activeTab === 'players' ? (
                                <>
                                    <div className="field">
                                        <label>Ім'я гравця</label>
                                        <input
                                            type="text"
                                            required
                                            value={playerForm.name}
                                            onChange={(e) => setPlayerForm({ ...playerForm, name: e.target.value })}
                                            placeholder="наприклад, Тимерлан Гусейнов"
                                        />
                                    </div>
                                    <div className="field">
                                        <label>Вік</label>
                                        <input
                                            type="number"
                                            required
                                            min="15"
                                            max="50"
                                            value={playerForm.age}
                                            onChange={(e) => setPlayerForm({ ...playerForm, age: e.target.value })}
                                            placeholder="25"
                                        />
                                    </div>
                                    <div className="field">
                                        <label>Позиція</label>
                                        <input
                                            type="text"
                                            required
                                            value={playerForm.position}
                                            onChange={(e) => setPlayerForm({ ...playerForm, position: e.target.value })}
                                            placeholder="наприклад, Форвард"
                                        />
                                    </div>
                                    <div className="field">
                                        <label>Команда</label>
                                        <select
                                            value={playerForm.teamId}
                                            onChange={(e) => setPlayerForm({ ...playerForm, teamId: e.target.value })}
                                        >
                                            <option value="">Без команди</option>
                                            {teamOptions.map((team) => (
                                                <option key={team.id} value={team.id}>
                                                    {team.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="field">
                                        <label>Назва команди</label>
                                        <input
                                            type="text"
                                            required
                                            value={teamForm.name}
                                            onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                                            placeholder="наприклад, ФК Чорноморець Одеса"
                                        />
                                    </div>
                                    <div className="field">
                                        <label>Тренер</label>
                                        <input
                                            type="text"
                                            required
                                            value={teamForm.coach}
                                            onChange={(e) => setTeamForm({ ...teamForm, coach: e.target.value })}
                                            placeholder="наприклад, Валерій Лобановський"
                                        />
                                    </div>
                                </>
                            )}

                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary">
                                    {isEditing ? 'Зберегти' : 'Створити'}
                                </button>
                                {isEditing && (
                                    <button type="button" className="btn btn-ghost" onClick={resetForm}>
                                        Скасувати
                                    </button>
                                )}
                            </div>
                        </form>
                    </section>

                    <section className="panel list-panel">
                        <div className="panel-head">
                            <h2>Список {activeTab === 'players' ? 'гравців' : 'команд'}</h2>
                            <span className="count">
                                {(activeTab === 'players' ? players : teams).length} записів
                            </span>
                        </div>

                        {loading ? (
                            <div className="loader">
                                <div className="spinner"></div>
                                <span>Завантаження...</span>
                            </div>
                        ) : (
                            <>
                                    <div className="table-wrap">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th>ID</th>
                                                    <th>{activeTab === 'players' ? "Ім'я" : 'Команда'}</th>
                                                    {activeTab === 'players' ? (
                                                        <>
                                                            <th>Вік</th>
                                                            <th>Позиція</th>
                                                            <th>Команда</th>
                                                        </>
                                                    ) : (
                                                        <th>Тренер</th>
                                                    )}
                                                    <th>Дії</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(activeTab === 'players' ? paginatedPlayers : paginatedTeams).map((item) => (
                                                    <tr key={item.id}>
                                                        <td>#{item.id}</td>
                                                        <td className="name">{item.name}</td>
                                                        {activeTab === 'players' ? (
                                                            <>
                                                                <td>{item.age}</td>
                                                                <td><span className="badge">{item.position}</span></td>
                                                                <td className="team-name">{item.team || '-'}</td>
                                                            </>
                                                        ) : (
                                                            <td className="coach">{item.coach}</td>
                                                        )}
                                                        <td className="actions">
                                                            <button
                                                                className="icon-btn edit"
                                                                onClick={() => handleEdit(item)}
                                                                title="Редагувати"
                                                            >
                                                                ✏️
                                                            </button>
                                                            <button
                                                                className="icon-btn delete"
                                                                onClick={() => requestDelete(item.id, item.name)}
                                                                title="Видалити"
                                                            >
                                                                ❌
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                {/* пагінація для гравців */}
                                    {/* пагінація */}
                                    {activeTab === 'players' && players.length > 0 && (
                                        <div className="pagination">
                                            <button
                                                className="pagination-btn"
                                                onClick={() => playersTable.setPageIndex(0)}
                                                disabled={!playersTable.getCanPreviousPage()}
                                                title="Перша сторінка"
                                            >
                                                «
                                            </button>
                                            <button
                                                className="pagination-btn"
                                                onClick={() => playersTable.previousPage()}
                                                disabled={!playersTable.getCanPreviousPage()}
                                                title="Попередня"
                                            >
                                                ‹
                                            </button>

                                            <span className="pagination-info">
                                                Сторінка{' '}
                                                <strong>
                                                    {playersTable.state.pagination.pageIndex + 1}
                                                </strong>{' '}
                                                з{' '}
                                                <strong>
                                                    {playersTable.getPageCount() || 1}
                                                </strong>
                                            </span>

                                            <button
                                                className="pagination-btn"
                                                onClick={() => playersTable.nextPage()}
                                                disabled={!playersTable.getCanNextPage()}
                                                title="Наступна"
                                            >
                                                ›
                                            </button>
                                            <button
                                                className="pagination-btn"
                                                onClick={() => playersTable.setPageIndex(playersTable.getPageCount() - 1)}
                                                disabled={!playersTable.getCanNextPage()}
                                                title="Остання сторінка"
                                            >
                                                »
                                            </button>
                                        </div>
                                    )}

                                    {activeTab === 'teams' && teams.length > 0 && (
                                        <div className="pagination">
                                            <button
                                                className="pagination-btn"
                                                onClick={() => teamsTable.setPageIndex(0)}
                                                disabled={!teamsTable.getCanPreviousPage()}
                                                title="Перша сторінка"
                                            >
                                                «
                                            </button>
                                            <button
                                                className="pagination-btn"
                                                onClick={() => teamsTable.previousPage()}
                                                disabled={!teamsTable.getCanPreviousPage()}
                                                title="Попередня"
                                            >
                                                ‹
                                            </button>

                                            <span className="pagination-info">
                                                Сторінка{' '}
                                                <strong>
                                                    {teamsTable.state.pagination.pageIndex + 1}
                                                </strong>{' '}
                                                з{' '}
                                                <strong>
                                                    {teamsTable.getPageCount() || 1}
                                                </strong>
                                            </span>

                                            <button
                                                className="pagination-btn"
                                                onClick={() => teamsTable.nextPage()}
                                                disabled={!teamsTable.getCanNextPage()}
                                                title="Наступна"
                                            >
                                                ›
                                            </button>
                                            <button
                                                className="pagination-btn"
                                                onClick={() => teamsTable.setPageIndex(teamsTable.getPageCount() - 1)}
                                                disabled={!teamsTable.getCanNextPage()}
                                                title="Остання сторінка"
                                            >
                                                »
                                            </button>
                                        </div>
                                    )}
                            </>
                        )}
                    </section>
                </div>
            </main>

            <footer className="footer">
                <div className="footer-inner">
                    <div className="footer-brand">
                        <span className="brand-icon">⚽</span>
                        <span>Футбольна ліга</span>
                    </div>
                    <p>Приклад на локалізацію: чиста архітектура ASP.NET Core Web API + React</p>
                    <p className="footer-copy">© {new Date().toLocaleString('uk-UA')}</p>
                </div>
            </footer>

            {confirmDialog && (
                <div className="modal-overlay" onClick={cancelDelete}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-icon">⚠</div>
                        <h3 className="modal-title">Видалити запис?</h3>
                        <p className="modal-text">
                            {activeTab === 'players' ? 'Гравця' : 'Команду'} «{confirmDialog.name}» буде видалено назавжди. Цю дію неможливо скасувати.
                        </p>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={cancelDelete}>
                                Скасувати
                            </button>
                            <button className="btn btn-danger" onClick={confirmDelete}>
                                Видалити
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}