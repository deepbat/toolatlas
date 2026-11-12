import Legal from './pages/Legal';
import SettingsPage from './pages/Settings';
import Guides from './pages/Guides';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import AboutPage from './pages/About';
import BrowsePage from './pages/Browse';
import CategoriesPage from './pages/Categories';
import FavoritesPage from './pages/Favorites';
import HomePage from './pages/Home';
import NotFoundPage from './pages/NotFound';
import RecentPage from './pages/Recent';
import ToolPage from './pages/ToolPage';
import ResourcesPage from './pages/Resources';
import WorkspacesPage from './pages/Workspaces';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="tools" element={<BrowsePage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="category/:categoryId" element={<BrowsePage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route path="recent" element={<RecentPage />} />
        <Route path="resources" element={<ResourcesPage />} />
        <Route path="workspaces" element={<WorkspacesPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="privacy" element={<Legal />} />
        <Route path="contact" element={<Legal />} />
        <Route path="terms" element={<Legal />} />
        <Route path="guides" element={<Guides />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="tools/:toolId" element={<ToolPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
