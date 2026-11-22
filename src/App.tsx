import { lazy, Suspense } from "react";
import { Link, Route, Routes, useParams } from "react-router-dom";
import InputScreen from "./screens/InputScreen";
import HomeScreen from "./screens/HomeScreen";
import { Header, Loading } from "./components";
const EditorScreen = lazy(() => import("./screens/EditorScreen"));
const PublishedScreen = lazy(() => import("./screens/PublishedScreen"));
const PublicScreen = lazy(() => import("./screens/PublicScreen"));
function NotFound() {
  return (
    <>
      <Header />
      <div className="empty-state">
        <h1>A little off the beaten path.</h1>
        <p>This page doesn’t exist. Your next idea starts here.</p>
        <Link className="button primary" to="/">
          Create a storefront
        </Link>
      </div>
    </>
  );
}
function EditorRoute() {
  const { slug } = useParams();
  return <EditorScreen key={slug} />;
}
function PublishedRoute() {
  const { slug } = useParams();
  return <PublishedScreen key={slug} />;
}
export default function App() {
  return (
    <Suspense fallback={<Loading message="Opening your store…" />}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/setup/about" element={<InputScreen />} />
        <Route path="/setup/offers" element={<InputScreen />} />
        <Route path="/edit/:slug" element={<EditorRoute />} />
        <Route path="/published/:slug" element={<PublishedRoute />} />
        <Route path="/s/:slug" element={<PublicScreen />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
