import SwiftUI

struct ChatView: View {
    @EnvironmentObject private var auth: AuthViewModel
    @StateObject private var vm = ChatViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                messageList
                composer
            }
            .background(Color.brandBackground.ignoresSafeArea())
            .navigationTitle("Grace Flare")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sign out") { Task { await auth.signOut() } }
                        .nunito(.caption)
                }
            }
        }
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if vm.messages.isEmpty { emptyState }
                    ForEach(vm.messages) { msg in
                        MessageBubble(message: msg).id(msg.id)
                    }
                    if let error = vm.errorMessage {
                        Text(error)
                            .nunito(.caption)
                            .foregroundStyle(Color.brandDestructive)
                            .padding(.horizontal, 16)
                    }
                }
                .padding(.vertical, 16)
            }
            .onChange(of: vm.messages.last?.content) { _, _ in
                if let last = vm.messages.last {
                    withAnimation(.easeOut(duration: 0.15)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ask anything")
                .quicksand(.title)
                .foregroundStyle(Color.brandForeground)
            Text("Try: \"What should I do about a 4-month sleep regression?\"")
                .nunito(.body)
                .foregroundStyle(Color.brandForeground.opacity(0.7))
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var composer: some View {
        HStack(spacing: 8) {
            TextField("Message", text: $vm.input, axis: .vertical)
                .nunito(.body)
                .lineLimit(1...5)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.brandBorder))
                .submitLabel(.send)
                .onSubmit { vm.send() }

            Button(action: { vm.isStreaming ? vm.cancel() : vm.send() }) {
                Image(systemName: vm.isStreaming ? "stop.fill" : "arrow.up")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 48, height: 48)
                    .background(Color.brandPrimary)
                    .clipShape(Circle())
            }
            .disabled(!vm.isStreaming && vm.input.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(.thinMaterial)
    }
}

private struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            Text(message.content.isEmpty ? "…" : message.content)
                .nunito(.body)
                .foregroundStyle(message.role == .user ? .white : Color.brandForeground)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(message.role == .user ? Color.brandPrimary : Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(message.role == .user ? Color.clear : Color.brandBorder)
                )
            if message.role != .user { Spacer(minLength: 40) }
        }
        .padding(.horizontal, 16)
    }
}
