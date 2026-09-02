import Login from "./components/Login"
import MovieSearch from "./components/MovieSearch"
import ProtectedRoute from "./components/Protectedroute"
import RequireProfile from "./components/RequireProfile"
import ProfileSelector from "./components/ProfileSelector"
import Genres from "./components/Genres"
import Languages from "./components/Languages"
import MyListPage from "./components/MyListPage"

export const routes=[
    {path:'/', element:<ProtectedRoute><RequireProfile><MovieSearch/></RequireProfile></ProtectedRoute>},
    {path:'/movies', element:<ProtectedRoute><RequireProfile><MovieSearch/></RequireProfile></ProtectedRoute>},
    {path:'/shows', element:<ProtectedRoute><RequireProfile><MovieSearch/></RequireProfile></ProtectedRoute>},
    {path:'/genres', element:<ProtectedRoute><RequireProfile><Genres/></RequireProfile></ProtectedRoute>},
    {path:'/languages', element:<ProtectedRoute><RequireProfile><Languages/></RequireProfile></ProtectedRoute>},
    {path:'/my-list', element:<ProtectedRoute><RequireProfile><MyListPage/></RequireProfile></ProtectedRoute>},
    {path:'/profiles', element:<ProtectedRoute><ProfileSelector/></ProtectedRoute>},
    {path:'/login', element:<Login/>},
]