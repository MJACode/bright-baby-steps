import Foundation
import Supabase

enum SupabaseConfig {
    static let url: URL = {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let url = URL(string: raw)
        else {
            fatalError("SUPABASE_URL missing from Info.plist — see ios-spike/README.md step 5.")
        }
        return url
    }()

    static let anonKey: String = {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String, !key.isEmpty else {
            fatalError("SUPABASE_ANON_KEY missing from Info.plist — see ios-spike/README.md step 5.")
        }
        return key
    }()
}

enum SupabaseService {
    static let client: SupabaseClient = SupabaseClient(
        supabaseURL: SupabaseConfig.url,
        supabaseKey: SupabaseConfig.anonKey
    )
}
