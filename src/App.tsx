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
import OfflinePage from './pages/Offline';
import ResourcesPage from './pages/Resources';
import SectionPage from './pages/Section';
import WorkspacesPage from './pages/Workspaces';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="pdf" element={<SectionPage sectionId="pdf" />} />
        <Route path="image" element={<SectionPage sectionId="image" />} />
        <Route path="video" element={<SectionPage sectionId="video" />} />
        <Route path="audio" element={<SectionPage sectionId="audio" />} />
        <Route path="text" element={<SectionPage sectionId="text" />} />
        <Route path="converter" element={<SectionPage sectionId="converter" />} />
        <Route path="web" element={<SectionPage sectionId="web" />} />
        <Route path="utilities" element={<SectionPage sectionId="utilities" />} />
        <Route path="tools" element={<BrowsePage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="category/:categoryId" element={<BrowsePage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route path="recent" element={<RecentPage />} />
        <Route path="offline" element={<OfflinePage />} />
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
